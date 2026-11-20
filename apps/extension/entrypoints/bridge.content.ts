import { browser } from 'wxt/browser';
import {
  MSG_SOURCE_EXT,
  isBookmarksRequest,
  type Bookmark,
  type ExtensionToWebMessage,
} from '@qianxu/shared';

import { EXT_MSG_BOOKMARKS_CHANGED, EXT_MSG_GET_BOOKMARKS } from '@/utils/bookmarks';
import { isAllowedOrigin, toMatchPatterns } from '@/utils/site';

export default defineContentScript({
  matches: toMatchPatterns(),
  runAt: 'document_end',
  main() {
    // matches 只能匹配到主机名，这里按完整 origin（含端口）再拦一层；
    // 白名单之外的页面连监听都不注册。
    if (!isAllowedOrigin(window.location.origin)) return;

    window.addEventListener('message', (event) => {
      if (event.source !== window) return;
      if (event.origin !== window.location.origin) return;
      if (!isBookmarksRequest(event.data)) return;
      void respond(event.data.requestId);
    });

    browser.runtime.onMessage.addListener((message) => {
      if ((message as { type?: unknown } | null)?.type !== EXT_MSG_BOOKMARKS_CHANGED) return;
      void push();
    });
  },
});

async function fetchBookmarks(): Promise<{ ok: boolean; bookmarks: Bookmark[] }> {
  try {
    const reply = (await browser.runtime.sendMessage({
      type: EXT_MSG_GET_BOOKMARKS,
    })) as { bookmarks?: Bookmark[] } | undefined;
    if (!Array.isArray(reply?.bookmarks)) return { ok: false, bookmarks: [] };
    return { ok: true, bookmarks: reply.bookmarks };
  } catch {
    return { ok: false, bookmarks: [] };
  }
}

async function respond(requestId: string) {
  const { ok, bookmarks } = await fetchBookmarks();
  const response: ExtensionToWebMessage = {
    source: MSG_SOURCE_EXT,
    type: 'BOOKMARKS_RESPONSE',
    requestId,
    ok,
    bookmarks,
  };
  window.postMessage(response, window.location.origin);
}

async function push() {
  const { ok, bookmarks } = await fetchBookmarks();
  const response: ExtensionToWebMessage = {
    source: MSG_SOURCE_EXT,
    type: 'BOOKMARKS_UPDATED',
    ok,
    bookmarks,
  };
  window.postMessage(response, window.location.origin);
}
