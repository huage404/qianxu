import { browser } from 'wxt/browser';
import {
  BOOKMARKS_STORAGE_KEY,
  MAX_OPS_PER_REQUEST,
  isBookmarkOp,
  isHttpUrl,
  type Bookmark,
  type BookmarkOp,
} from '@qianxu/shared';

import {
  EXT_MSG_BOOKMARKS_CHANGED,
  EXT_MSG_GET_BOOKMARKS,
  EXT_MSG_HEALTH_CHANGED,
  EXT_MSG_MUTATE_BOOKMARKS,
  listBrowserBookmarks,
  watchBookmarks,
} from '@/utils/bookmarks';
import {
  SWEEP_ALARM,
  SWEEP_PERIOD_MINUTES,
  loadHealth,
  probeSingle,
  pruneHealth,
  runSweep,
  saveHealth,
} from '@/utils/health';
import { applyOps } from '@/utils/mutations';
import { isAllowedOrigin } from '@/utils/site';

const MIGRATION_KEY = 'legacy-bookmarks-migrated';

/** 同一时刻只跑一轮，避免 alarm 与 onInstalled 撞车 */
let sweeping = false;

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // 写入通道改的是用户真实的浏览器书签，所以门禁只严不松：
    // content script 已在完整 origin 上拦过一层，这里认不出来源就什么都不做。
    if (!isAllowedSender(sender)) return;

    if (isGetBookmarksMessage(message)) {
      void respondWithTree(sendResponse);
      return true;
    }

    if (isMutateMessage(message)) {
      void respondWithMutation(message.ops, sendResponse);
      return true;
    }
  });

  watchBookmarks(() => {
    broadcast(EXT_MSG_BOOKMARKS_CHANGED);
  });

  // 新收藏当场单测一次，用户不必等下一轮轮询就能看到结果
  browser.bookmarks.onCreated.addListener((_id, node) => {
    if (!node.url || !isHttpUrl(node.url)) return;
    void probeSingle(node.url).then((health) => broadcast(EXT_MSG_HEALTH_CHANGED, { health }));
  });

  void ensureSweepAlarm();

  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name !== SWEEP_ALARM) return;
    void sweepNow();
  });

  browser.runtime.onInstalled.addListener(() => void migrateLegacyBookmarks());
  browser.runtime.onStartup.addListener(() => void migrateLegacyBookmarks());
});

/** 每轮只测到期子集，跑完把结果推给页面 */
async function sweepNow(): Promise<void> {
  if (sweeping) return;
  sweeping = true;
  try {
    const { bookmarks } = await listBrowserBookmarks();
    const urls = bookmarks.map((bookmark) => bookmark.url).filter(isHttpUrl);
    const { health, probed } = await runSweep(urls);
    if (probed > 0) broadcast(EXT_MSG_HEALTH_CHANGED, { health });
  } catch {
    // 单轮失败不影响下一轮，页面也仍能看到上一轮的结果
  } finally {
    sweeping = false;
  }
}

async function respondWithTree(sendResponse: (response: unknown) => void): Promise<void> {
  try {
    const { bookmarks, folders } = await listBrowserBookmarks();
    sendResponse({ ok: true, bookmarks, folders, health: await loadHealth() });
  } catch {
    sendResponse({ ok: false, bookmarks: [], folders: [], health: {} });
  }
}

/**
 * 执行一批编辑，然后把执行后的真实书签树整棵回传。
 *
 * 页面手里的节点 id 来自上一帧，同步或人工改动后随时可能失效；
 * 让它以回执为准，比让它自己猜新状态更可靠。
 */
async function respondWithMutation(
  ops: BookmarkOp[],
  sendResponse: (response: unknown) => void,
): Promise<void> {
  try {
    const results = await applyOps(ops);
    const { bookmarks, folders } = await listBrowserBookmarks();

    // 改了链接或删掉书签，旧 URL 的探测历史就成了孤儿，顺手回收
    const health = pruneHealth(
      await loadHealth(),
      bookmarks.map((bookmark) => bookmark.url),
    );
    await saveHealth(health);
    sendResponse({ ok: true, results, bookmarks, folders, health });

    // 新链接当场重测；书签树本身的广播由 watchBookmarks 的原生事件负责
    const retargeted = ops.filter((op, index) => op.kind === 'setUrl' && results[index]?.ok);
    for (const op of retargeted) {
      if (op.kind === 'setUrl') await probeSingle(op.url.trim());
    }
    if (retargeted.length > 0) {
      broadcast(EXT_MSG_HEALTH_CHANGED, { health: await loadHealth() });
    }
  } catch {
    sendResponse({ ok: false, results: [], bookmarks: [], folders: [], health: {} });
  }
}

async function ensureSweepAlarm(): Promise<void> {
  // 不加判断就 create 会在每次 worker 苏醒时重置计时，重度使用下 alarm 反而永远不触发
  if (await browser.alarms.get(SWEEP_ALARM)) return;
  await browser.alarms.create(SWEEP_ALARM, {
    periodInMinutes: SWEEP_PERIOD_MINUTES,
    // 首轮延后一分钟，装完立刻爆发几十个请求不好看
    delayInMinutes: 1,
  });
}

function broadcast(type: string, payload?: Record<string, unknown>): void {
  void browser.tabs.query({}).then((tabs) => {
    for (const tab of tabs) {
      if (tab.id === undefined) continue;
      void browser.tabs.sendMessage(tab.id, { type, ...payload }).catch(() => {});
    }
  });
}

function isGetBookmarksMessage(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { type?: unknown }).type === EXT_MSG_GET_BOOKMARKS
  );
}

/**
 * 内部通道的形状校验。content script 转发前已经按页面协议拦过一次，
 * 这里是第二道：宁可回一句格式不对，也不把没校验过的 ops 直接喂给书签 API。
 */
function isMutateMessage(value: unknown): value is { type: string; ops: BookmarkOp[] } {
  if (typeof value !== 'object' || value === null) return false;
  const msg = value as { type?: unknown; ops?: unknown };
  return (
    msg.type === EXT_MSG_MUTATE_BOOKMARKS &&
    Array.isArray(msg.ops) &&
    msg.ops.length > 0 &&
    msg.ops.length <= MAX_OPS_PER_REQUEST &&
    msg.ops.every(isBookmarkOp)
  );
}

function isAllowedSender(sender: { tab?: unknown; origin?: string; url?: string }): boolean {
  // 没有 tab 的是 popup、options 等扩展自身页面
  if (!sender.tab) return true;
  if (sender.origin) return isAllowedOrigin(sender.origin);
  if (!sender.url) return false;
  try {
    return isAllowedOrigin(new URL(sender.url).origin);
  } catch {
    return false;
  }
}

async function migrateLegacyBookmarks() {
  try {
    const stored = await browser.storage.local.get([MIGRATION_KEY, BOOKMARKS_STORAGE_KEY]);
    if (stored[MIGRATION_KEY]) return;

    const legacy = stored[BOOKMARKS_STORAGE_KEY];
    const items: Bookmark[] = Array.isArray(legacy) ? legacy : [];
    if (items.length > 0) {
      const existing = new Set(
        (await listBrowserBookmarks()).bookmarks.map((bookmark) => bookmark.url),
      );
      for (const item of items) {
        if (typeof item?.url !== 'string' || !isHttpUrl(item.url)) continue;
        if (existing.has(item.url)) continue;
        try {
          await browser.bookmarks.create({
            title: item.title?.trim() || item.url,
            url: item.url,
          });
          existing.add(item.url);
        } catch {
          // 单条写入失败不阻塞其余条目
        }
      }
    }

    await browser.storage.local.set({ [MIGRATION_KEY]: true });
    await browser.storage.local.remove(BOOKMARKS_STORAGE_KEY);
  } catch {
    // 迁移尽力而为，失败时下次启动重试
  }
}
