import { browser } from 'wxt/browser';
import { BOOKMARKS_STORAGE_KEY, isHttpUrl, type Bookmark } from '@qianxu/shared';

import {
  EXT_MSG_BOOKMARKS_CHANGED,
  EXT_MSG_GET_BOOKMARKS,
  EXT_MSG_HEALTH_CHANGED,
  listBrowserBookmarks,
  watchBookmarks,
} from '@/utils/bookmarks';
import {
  SWEEP_ALARM,
  SWEEP_PERIOD_MINUTES,
  loadHealth,
  probeSingle,
  runSweep,
} from '@/utils/health';
import { isAllowedOrigin } from '@/utils/site';

const MIGRATION_KEY = 'legacy-bookmarks-migrated';

/** 同一时刻只跑一轮，避免 alarm 与 onInstalled 撞车 */
let sweeping = false;

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!isGetBookmarksMessage(message)) return;
    // content script 已在白名单 origin 上做门禁，这里是第二道；
    // 无法确认来源时不返回任何书签数据。
    if (!isAllowedSender(sender)) return;
    void listBrowserBookmarks()
      .then(async (bookmarks) =>
        sendResponse({ ok: true, bookmarks, health: await loadHealth() }),
      )
      .catch(() => sendResponse({ ok: false, bookmarks: [], health: {} }));
    return true;
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
    const bookmarks = await listBrowserBookmarks();
    const urls = bookmarks.map((bookmark) => bookmark.url).filter(isHttpUrl);
    const { health, probed } = await runSweep(urls);
    if (probed > 0) broadcast(EXT_MSG_HEALTH_CHANGED, { health });
  } catch {
    // 单轮失败不影响下一轮，页面也仍能看到上一轮的结果
  } finally {
    sweeping = false;
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
      const existing = new Set((await listBrowserBookmarks()).map((bookmark) => bookmark.url));
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
