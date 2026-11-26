import {
  MSG_SOURCE_WEB,
  bridgeLog,
  bridgeWarn,
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
      if (event.data.requestId !== requestId) {
        bridgeWarn('忽略 requestId 不匹配的响应', {
          expected: requestId,
          received: event.data.requestId,
        });
        return;
      }
      bridgeLog('收到响应', {
        requestId,
        ok: event.data.ok,
        count: event.data.bookmarks.length,
      });
      cleanup();
      resolve(event.data);
    };

    const timer = window.setTimeout(() => {
      cleanup();
      bridgeWarn('本轮请求无响应', {
        requestId,
        timeoutMs,
        origin: window.location.origin,
        hint: 'content script 未注入本页面，或本页 origin 不在扩展白名单内',
      });
      resolve(null);
    }, timeoutMs);

    window.addEventListener('message', onMessage);

    const request: WebToExtensionMessage = {
      source: MSG_SOURCE_WEB,
      type: 'BOOKMARKS_REQUEST',
      requestId,
    };
    bridgeLog('发送请求', { requestId, origin: window.location.origin, timeoutMs });
    window.postMessage(request, window.location.origin);
  });
}

export async function requestBookmarks(
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<BookmarksResult> {
  // 首次没有响应可能只是 content script 尚未注入，再试一次；
  // 明确返回 ok: false 时不再重试。
  const response = (await requestOnce(timeoutMs)) ?? (await requestOnce(timeoutMs));
  if (!response) {
    bridgeWarn('两次请求均无响应，判定插件不存在', { origin: window.location.origin });
    return { status: 'absent' };
  }
  if (response.ok === false) {
    bridgeWarn('插件响应读取收藏夹失败', { requestId: response.requestId });
    return { status: 'error' };
  }
  bridgeLog('书签加载完成', { count: response.bookmarks.length });
  return { status: 'ok', bookmarks: response.bookmarks };
}

export function subscribeBookmarks(listener: (update: BookmarksUpdate) => void): () => void {
  const onMessage = (event: MessageEvent) => {
    if (event.source !== window) return;
    if (!isBookmarksUpdated(event.data)) return;
    bridgeLog('收到插件主动推送', { ok: event.data.ok, count: event.data.bookmarks.length });
    listener({ ok: event.data.ok !== false, bookmarks: event.data.bookmarks });
  };
  window.addEventListener('message', onMessage);
  return () => window.removeEventListener('message', onMessage);
}
