import {
  MSG_SOURCE_WEB,
  bridgeLog,
  bridgeWarn,
  isBookmarksResponse,
  isBookmarksUpdated,
  isHealthUpdated,
  type Bookmark,
  type BookmarksResponse,
  type LinkHealthMap,
  type WebToExtensionMessage,
} from '@qianxu/shared';

import { createId } from '@/lib/id';

const DEFAULT_TIMEOUT_MS = 800;

export type BookmarksResult =
  | { status: 'ok'; bookmarks: Bookmark[]; newTabOverride: boolean; health: LinkHealthMap }
  | { status: 'error'; newTabOverride: boolean }
  | { status: 'absent' };

export interface BookmarksUpdate {
  ok: boolean;
  bookmarks: Bookmark[];
  health: LinkHealthMap;
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
    return { status: 'error', newTabOverride: response.newTabOverride === true };
  }
  bridgeLog('书签加载完成', { count: response.bookmarks.length });
  return {
    status: 'ok',
    bookmarks: response.bookmarks,
    newTabOverride: response.newTabOverride === true,
    // 旧版本扩展不带该字段，页面此时不展示健康度
    health: response.health ?? {},
  };
}

export function subscribeBookmarks(listener: (update: BookmarksUpdate) => void): () => void {
  const onMessage = (event: MessageEvent) => {
    if (event.source !== window) return;
    if (!isBookmarksUpdated(event.data)) return;
    bridgeLog('收到插件主动推送', { ok: event.data.ok, count: event.data.bookmarks.length });
    listener({
      ok: event.data.ok !== false,
      bookmarks: event.data.bookmarks,
      health: event.data.health ?? {},
    });
  };
  window.addEventListener('message', onMessage);
  return () => window.removeEventListener('message', onMessage);
}

/** 轮询完成只会改健康度，单独一条通道，避免为此重读整个收藏夹 */
export function subscribeHealth(listener: (health: LinkHealthMap) => void): () => void {
  const onMessage = (event: MessageEvent) => {
    if (event.source !== window) return;
    if (!isHealthUpdated(event.data)) return;
    bridgeLog('收到健康度推送', { count: Object.keys(event.data.health).length });
    listener(event.data.health);
  };
  window.addEventListener('message', onMessage);
  return () => window.removeEventListener('message', onMessage);
}
