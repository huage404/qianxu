import {
  MSG_SOURCE_WEB,
  isBookmarksResponse,
  isBookmarksUpdated,
  type Bookmark,
  type BookmarksResponse,
  type WebToExtensionMessage,
} from '@qianxu/shared';

import { createId } from '@/lib/id';

const DEFAULT_TIMEOUT_MS = 800;

export type BookmarksResult =
  | { status: 'ok'; bookmarks: Bookmark[] }
  | { status: 'error' }
  | { status: 'absent' };

export interface BookmarksUpdate {
  ok: boolean;
  bookmarks: Bookmark[];
}

function requestOnce(timeoutMs: number): Promise<BookmarksResponse | null> {
  return new Promise((resolve) => {
    const requestId = createId();

    const cleanup = () => {
      window.removeEventListener('message', onMessage);
      window.clearTimeout(timer);
    };

    const onMessage = (event: MessageEvent) => {
      if (event.source !== window) return;
      if (!isBookmarksResponse(event.data)) return;
      if (event.data.requestId !== requestId) return;
      cleanup();
      resolve(event.data);
    };

    const timer = window.setTimeout(() => {
      cleanup();
      resolve(null);
    }, timeoutMs);

    window.addEventListener('message', onMessage);

    const request: WebToExtensionMessage = {
      source: MSG_SOURCE_WEB,
      type: 'BOOKMARKS_REQUEST',
      requestId,
    };
    window.postMessage(request, window.location.origin);
  });
}

export async function requestBookmarks(
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<BookmarksResult> {
  // 首次没有响应可能只是 content script 尚未注入，再试一次；
  // 明确返回 ok: false 时不再重试。
  const response = (await requestOnce(timeoutMs)) ?? (await requestOnce(timeoutMs));
  if (!response) return { status: 'absent' };
  if (response.ok === false) return { status: 'error' };
  return { status: 'ok', bookmarks: response.bookmarks };
}

export function subscribeBookmarks(listener: (update: BookmarksUpdate) => void): () => void {
  const onMessage = (event: MessageEvent) => {
    if (event.source !== window) return;
    if (!isBookmarksUpdated(event.data)) return;
    listener({ ok: event.data.ok !== false, bookmarks: event.data.bookmarks });
  };
  window.addEventListener('message', onMessage);
  return () => window.removeEventListener('message', onMessage);
}
