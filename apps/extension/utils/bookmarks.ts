import { browser } from 'wxt/browser';
import type { Bookmark } from '@qianxu/shared';

import { flattenBookmarkTree } from '@/utils/bookmark-tree';

export const EXT_MSG_GET_BOOKMARKS = 'qianxu:get-bookmarks';
export const EXT_MSG_BOOKMARKS_CHANGED = 'qianxu:bookmarks-changed';
/** 轮询测完新一轮，通知页面只刷新健康度，不必重读收藏夹 */
export const EXT_MSG_HEALTH_CHANGED = 'qianxu:health-changed';

export async function listBrowserBookmarks(): Promise<Bookmark[]> {
  const tree = await browser.bookmarks.getTree();
  return withFavicons(flattenBookmarkTree(tree));
}

function withFavicons(bookmarks: Bookmark[]): Bookmark[] {
  if (import.meta.env.BROWSER !== 'chrome') return bookmarks;
  // WXT 把 getURL 的参数收窄为 public 目录下的路径，_favicon 是浏览器内置路径
  const getURL = browser.runtime.getURL as (path: string) => string;
  return bookmarks.map((bookmark) => ({
    ...bookmark,
    // Chrome 的 _favicon API 返回本地缓存的图标，页面加载时不会访问外网
    faviconUrl: getURL(`/_favicon/?pageUrl=${encodeURIComponent(bookmark.url)}&size=64`),
  }));
}

type BookmarkEvent = {
  addListener: (listener: () => void) => void;
  removeListener: (listener: () => void) => void;
};

export function watchBookmarks(listener: () => void): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(listener, 120);
  };

  const events: BookmarkEvent[] = [
    browser.bookmarks.onCreated,
    browser.bookmarks.onRemoved,
    browser.bookmarks.onChanged,
    browser.bookmarks.onMoved,
    browser.bookmarks.onImportEnded,
  ];
  for (const event of events) event.addListener(schedule);

  return () => {
    clearTimeout(timer);
    for (const event of events) event.removeListener(schedule);
  };
}
