import { browser } from 'wxt/browser';
import {
  MSG_SOURCE_EXT,
  isBookmarksRequest,
  type Bookmark,
  type ExtensionToWebMessage,
} from '@qianxu/shared';

import { EXT_MSG_BOOKMARKS_CHANGED, EXT_MSG_GET_BOOKMARKS } from '@/utils/bookmarks';

// 生产域名上线后需要追加到 matches 中
export default defineContentScript({
  matches: ['http://localhost/*', 'http://127.0.0.1/*'],
  runAt: 'document_end',
  main() {
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

async function fetchBookmarks(): Promise<Bookmark[]> {
  try {
    const reply = (await browser.runtime.sendMessage({
      type: EXT_MSG_GET_BOOKMARKS,
    })) as { bookmarks?: Bookmark[] } | undefined;
    return Array.isArray(reply?.bookmarks) ? reply.bookmarks : [];
  } catch {
    return [];
  }
}

async function respond(requestId: string) {
  const response: ExtensionToWebMessage = {
    source: MSG_SOURCE_EXT,
    type: 'BOOKMARKS_RESPONSE',
    requestId,
    bookmarks: await fetchBookmarks(),
  };
  window.postMessage(response, window.location.origin);
}

async function push() {
  const response: ExtensionToWebMessage = {
    source: MSG_SOURCE_EXT,
    type: 'BOOKMARKS_UPDATED',
    bookmarks: await fetchBookmarks(),
  };
  window.postMessage(response, window.location.origin);
}
