import { browser } from 'wxt/browser';
import { BOOKMARKS_STORAGE_KEY, isHttpUrl, type Bookmark } from '@qianxu/shared';

import {
  EXT_MSG_BOOKMARKS_CHANGED,
  EXT_MSG_GET_BOOKMARKS,
  listBrowserBookmarks,
  watchBookmarks,
} from '@/utils/bookmarks';

const MIGRATION_KEY = 'legacy-bookmarks-migrated';

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!isGetBookmarksMessage(message)) return;
    void listBrowserBookmarks()
      .then((bookmarks) => sendResponse({ bookmarks }))
      .catch(() => sendResponse({ bookmarks: [] }));
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
