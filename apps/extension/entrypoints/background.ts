import { browser } from 'wxt/browser';
import { BOOKMARKS_STORAGE_KEY, isHttpUrl, type Bookmark } from '@qianxu/shared';

import {
  EXT_MSG_BOOKMARKS_CHANGED,
  EXT_MSG_GET_BOOKMARKS,
  listBrowserBookmarks,
  watchBookmarks,
} from '@/utils/bookmarks';
import { isAllowedOrigin } from '@/utils/site';

const MIGRATION_KEY = 'legacy-bookmarks-migrated';

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!isGetBookmarksMessage(message)) return;
    // content script 已在白名单 origin 上做门禁，这里是第二道；
    // 无法确认来源时不返回任何书签数据。
    if (!isAllowedSender(sender)) return;
    void listBrowserBookmarks()
      .then((bookmarks) => sendResponse({ ok: true, bookmarks }))
      .catch(() => sendResponse({ ok: false, bookmarks: [] }));
    return true;
  });

  watchBookmarks(() => {
    void browser.tabs.query({}).then((tabs) => {
      for (const tab of tabs) {
        if (tab.id === undefined) continue;
        void browser.tabs
          .sendMessage(tab.id, { type: EXT_MSG_BOOKMARKS_CHANGED })
          .catch(() => {});
      }
    });
  });

  browser.runtime.onInstalled.addListener(() => void migrateLegacyBookmarks());
  browser.runtime.onStartup.addListener(() => void migrateLegacyBookmarks());
});

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
