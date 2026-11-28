import { browser } from 'wxt/browser';
import {
  type LinkFailureReason,
  type LinkHealthMap,
  type LinkHealthRecord,
} from '@qianxu/shared';

export const HEALTH_STORAGE_KEY = 'qianxu:link-health';
export const SWEEP_ALARM = 'qianxu:link-health-sweep';

export const SWEEP_PERIOD_MINUTES = 60;
/** 一轮测多少条。同时把单轮压在 service worker 存活窗口内，跑不完下轮接着挑 */
export const SWEEP_BATCH = 60;
const CONCURRENCY = 4;
const PROBE_TIMEOUT_MS = 10_000;

const DAY_MS = 24 * 60 * 60 * 1000;
/** 判定正常的链接两周后复查 */
const FRESH_AFTER_MS = 14 * DAY_MS;
/** 可疑与失效的三天后复测，给临时故障自愈的机会 */
const ATTENTION_AFTER_MS = 3 * DAY_MS;

/** 服务端明确应答但挡了程序化访问，这类永远不升级为失效 */
const BLOCKED_STATUS = new Set([401, 403, 429, 451]);
/** 4xx 是站点自己说「不在了」，属于正面证据，两次即可定论 */
const DEAD_AFTER_HTTP_FAILURES = 2;
/** 5xx 与连接层失败分不清「站点坏了」和「我这边到不了」，要三次 */
const DEAD_AFTER_SOFT_FAILURES = 3;
/** 一轮里连接层失败占比超过这个比例，判定为本机断网而不是链接集体失效 */
const OFFLINE_SHARE = 0.9;
const OFFLINE_MIN_SAMPLE = 5;

export interface ProbeInput {
  /** HTTP 状态码；网络层失败时为 null */
  httpStatus: number | null;
  /** httpStatus 为 null 时的失败归类 */
  reason?: LinkFailureReason;
  /** 本轮之前该链接的连续失败次数 */
  previousFailures: number;
}

/** 一次探测的网络层结果，尚未结合历史记录 */
export interface ProbeOutcome {
  httpStatus: number | null;
  reason?: LinkFailureReason;
}

/**
 * 分级判定的唯一入口，不碰网络，误报风险全集中在这里。
 *
 * 判定只信正面证据：HTTP 状态码是站点自己回的，4xx 两次就能定论；
 * 而连接层失败分不清是站点没了还是本机/中间链路到不了，一律只能到「可疑」。
 */
export function classifyProbe(input: ProbeInput): Pick<LinkHealthRecord, 'status' | 'failures'> {
  const { httpStatus, reason, previousFailures } = input;

  if (reason === 'offline') {
    // 本机没网，这条链接什么都证明不了，保持原有失败计数
    return { status: 'unknown', failures: previousFailures };
  }

  if (httpStatus === null) {
    const failures = previousFailures + 1;
    // 超时永远不定论：实测里 news.ycombinator.com 与 youtube.com 都会超时，
    // 它们当然没死，只是从这个网络到不了。判成失效就是误伤。
    if (reason === 'timeout') return { status: 'suspect', failures };
    // DNS 失败可能真是域名没了，也可能是解析被污染，所以门槛放高
    return { status: failures >= DEAD_AFTER_SOFT_FAILURES ? 'dead' : 'suspect', failures };
  }

  if (httpStatus >= 200 && httpStatus < 400) {
    return { status: 'ok', failures: 0 };
  }

  if (BLOCKED_STATUS.has(httpStatus)) {
    // 反爬拦截说明站点活着，只是不理程序化请求
    return { status: 'suspect', failures: 0 };
  }

  const failures = previousFailures + 1;
  const threshold = isHardStatus(httpStatus) ? DEAD_AFTER_HTTP_FAILURES : DEAD_AFTER_SOFT_FAILURES;
  return { status: failures >= threshold ? 'dead' : 'suspect', failures };
}

function isHardStatus(httpStatus: number): boolean {
  // 408/425 是时序问题而非资源问题，5xx 是服务端临时故障，都算软失败
  if (httpStatus === 408 || httpStatus === 425) return false;
  return httpStatus < 500;
}

/** 单个链接的完整记录 */
export function recordProbe(
  previous: LinkHealthRecord | undefined,
  input: ProbeInput,
  now = Date.now(),
): LinkHealthRecord {
  const { status, failures } = classifyProbe({
    ...input,
    previousFailures: previous?.failures ?? 0,
  });
  return {
    status,
    failures,
    // 本机断网不算这次探测，沿用上次时间，避免把好链接的复查窗口白白推后两周
    checkedAt: input.reason === 'offline' ? (previous?.checkedAt ?? 0) : now,
    httpStatus: input.httpStatus ?? undefined,
    reason: input.httpStatus === null ? input.reason : 'http',
  };
}

export async function loadHealth(): Promise<LinkHealthMap> {
  const stored = await browser.storage.local.get([HEALTH_STORAGE_KEY]);
  const raw = stored[HEALTH_STORAGE_KEY];
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
  return raw as LinkHealthMap;
}

export async function saveHealth(health: LinkHealthMap): Promise<void> {
  await browser.storage.local.set({ [HEALTH_STORAGE_KEY]: health });
}

/** 收藏夹里已经不存在、或 URL 被改掉的记录要回收，否则探测历史会一直涨 */
export function pruneHealth(health: LinkHealthMap, urls: Iterable<string>): LinkHealthMap {
  const keep = new Set(urls);
  const next: LinkHealthMap = {};
  for (const [url, record] of Object.entries(health)) {
    if (keep.has(url)) next[url] = record;
  }
  return next;
}

/**
 * 挑出本轮该测的链接：从未探测的最先，其余按最旧优先。
 * 坏链接的复查窗口比好链接更短，让它们有机会自己翻回 ok。
 */
export function pickDue(health: LinkHealthMap, urls: string[], now = Date.now()): string[] {
  const due: string[] = [];
  const never: string[] = [];

  for (const url of urls) {
    const record = health[url];
    if (!record || record.checkedAt === 0) {
      never.push(url);
      continue;
    }
    const window = record.status === 'ok' ? FRESH_AFTER_MS : ATTENTION_AFTER_MS;
    if (now - record.checkedAt >= window) due.push(url);
  }

  never.sort();
  due.sort((a, b) => (health[a]?.checkedAt ?? 0) - (health[b]?.checkedAt ?? 0));
  return [...never, ...due];
}

export interface SweepResult {
  health: LinkHealthMap;
  probed: number;
  /** 整轮因网络层失败占比过高而判定为本机断网 */
  offline: boolean;
}

/** 一轮轮询：只处理到期子集，每批落盘，service worker 被回收也只丢一批 */
export async function runSweep(
  urls: string[],
  options: { now?: number; batch?: number } = {},
): Promise<SweepResult> {
  const now = options.now ?? Date.now();
  const limit = options.batch ?? SWEEP_BATCH;

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { health: await loadHealth(), probed: 0, offline: true };
  }

  const health = pruneHealth(await loadHealth(), urls);
  const queue = pickDue(health, urls, now).slice(0, limit);
  if (queue.length === 0) return { health, probed: 0, offline: false };

  const outcomes = await mapWithConcurrency(queue, CONCURRENCY, async (url) => ({
    url,
    outcome: await probeOnce(url),
  }));

  // 断网守卫：真断网时整批链接都会以网络层错误收场，此时逐条计失败会把
  // 整个收藏夹标红。用「这一轮的失败几乎全是网络层」来识别，比依赖某个
  // 基准站点更可靠——基准域名在国内可能被墙，而收藏夹本身就是天然样本。
  const networkFailures = outcomes.filter(
    (entry) => entry.outcome.httpStatus === null && entry.outcome.reason !== 'timeout',
  ).length;
  const offline =
    outcomes.length >= OFFLINE_MIN_SAMPLE && networkFailures / outcomes.length >= OFFLINE_SHARE;

  let probed = 0;
  for (const { url, outcome } of outcomes) {
    const previousFailures = health[url]?.failures ?? 0;
    const input: ProbeInput = offline
      ? { httpStatus: null, reason: 'offline', previousFailures }
      : { ...outcome, previousFailures };
    health[url] = recordProbe(health[url], input, now);
    probed++;

    // 分批落盘，避免 worker 中途被回收时整轮白跑
    if (probed % CONCURRENCY === 0) await saveHealth(health);
  }

  await saveHealth(health);
  return { health, probed, offline };
}

/** 收藏即刻单测，不等下一轮轮询；返回整张表便于直接推给页面 */
export async function probeSingle(url: string): Promise<LinkHealthMap> {
  const health = await loadHealth();
  const outcome = await probeOnce(url);
  const input: ProbeInput = {
    ...outcome,
    previousFailures: health[url]?.failures ?? 0,
  };
  health[url] = recordProbe(health[url], input);
  await saveHealth(health);
  return health;
}

/** 只取状态码，响应体立刻释放，不把整站下载下来 */
async function probeOnce(url: string): Promise<ProbeOutcome> {
  let timedOut = false;
  const controller = new AbortController();
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, PROBE_TIMEOUT_MS);

  try {
    // credentials: 'omit' 有两层意义：不把用户 Cookie 发给每个收藏站点，
    // 也避免以登录态探测时把付费墙页面误判成「正常」。
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      credentials: 'omit',
      cache: 'no-store',
      signal: controller.signal,
    });
    void response.body?.cancel().catch(() => {});
    return { httpStatus: response.status };
  } catch {
    return { httpStatus: null, reason: timedOut ? 'timeout' : 'network' };
  } finally {
    clearTimeout(timer);
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  // 按块并发而不是逐个领取：60 条量级下队列调度省不出多少时间，分块更好读
  for (let start = 0; start < items.length; start += limit) {
    const chunk = items.slice(start, start + limit);
    const settled = await Promise.all(chunk.map(fn));
    results.push(...settled);
  }
  return results;
}
