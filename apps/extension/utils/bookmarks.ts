import { browser } from 'wxt/browser';
import type { Bookmark } from '@qianxu/shared';

import { flattenBookmarkTree } from '@/utils/bookmark-tree';

export const EXT_MSG_GET_BOOKMARKS = 'qianxu:get-bookmarks';
export const EXT_MSG_BOOKMARKS_CHANGED = 'qianxu:bookmarks-changed';

export async function listBrowserBookmarks(): Promise<Bookmark[]> {
  const tree = await browser.bookmarks.getTree();
  return flattenBookmarkTree(tree);
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
