import {
  MSG_SOURCE_WEB,
  bridgeLog,
  bridgeWarn,
  isBookmarksMutateResponse,
  isBookmarksResponse,
  isBookmarksUpdated,
  isHealthUpdated,
  type Bookmark,
  type BookmarkFolder,
  type BookmarkOp,
  type BookmarkOpResult,
  type BookmarksMutateResponse,
  type BookmarksResponse,
  type LinkHealthMap,
  type WebToExtensionMessage,
} from '@qianxu/shared';

import { createId } from '@/lib/id';

const DEFAULT_TIMEOUT_MS = 800;
/** 批量编辑要在书签树里逐条落地，比读一次树慢得多，超时单独放宽 */
const MUTATE_TIMEOUT_MS = 8_000;

export type BookmarksResult =
  | {
      status: 'ok';
      bookmarks: Bookmark[];
      folders: BookmarkFolder[];
      newTabOverride: boolean;
      health: LinkHealthMap;
    }
  | { status: 'error'; newTabOverride: boolean }
  | { status: 'absent' };

export interface BookmarksUpdate {
  ok: boolean;
  bookmarks: Bookmark[];
  folders: BookmarkFolder[];
  health: LinkHealthMap;
}

export interface MutateResult {
  status: 'ok' | 'error';
  results: BookmarkOpResult[];
  bookmarks: Bookmark[];
  folders: BookmarkFolder[];
  health: LinkHealthMap;
}

function roundTrip<T extends { requestId: string }>(
  build: (requestId: string) => WebToExtensionMessage,
  matches: (value: unknown) => value is T,
  timeoutMs: number,
  label: string,
): Promise<T | null> {
  return new Promise((resolve) => {
    const requestId = createId();

    const cleanup = () => {
      window.removeEventListener('message', onMessage);
      window.clearTimeout(timer);
    };

    const onMessage = (event: MessageEvent) => {
      if (event.source !== window) return;
      if (!matches(event.data)) return;
      if (event.data.requestId !== requestId) {
        bridgeWarn('忽略 requestId 不匹配的响应', {
          expected: requestId,
          received: event.data.requestId,
        });
        return;
      }
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

    const request = build(requestId);
    bridgeLog(label + '发送请求', { requestId, origin: window.location.origin, timeoutMs });
    window.postMessage(request, window.location.origin);
  });
}

function requestOnce(timeoutMs: number): Promise<BookmarksResponse | null> {
  return roundTrip(
    (requestId) => ({ source: MSG_SOURCE_WEB, type: 'BOOKMARKS_REQUEST', requestId }),
    isBookmarksResponse,
    timeoutMs,
    '书签',
  );
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
    // 旧版本扩展不带这两个字段，页面此时不展示健康度、也不开放编辑
    folders: response.folders ?? [],
    health: response.health ?? {},
    newTabOverride: response.newTabOverride === true,
  };
}

/**
 * 提交一批书签编辑，回执里带执行后的完整书签树。
 *
 * 与读取不同，这里一次都不重试：请求可能已经落地、只是响应没回来，
 * 重发就会把同一批操作做两遍。宁可让用户手动刷新，也不重复改他的收藏夹。
 */
export async function mutateBookmarks(ops: BookmarkOp[]): Promise<MutateResult> {
  const response: BookmarksMutateResponse | null = await roundTrip(
    (requestId) => ({ source: MSG_SOURCE_WEB, type: 'BOOKMARKS_MUTATE', requestId, ops }),
    isBookmarksMutateResponse,
    MUTATE_TIMEOUT_MS,
    '书签编辑',
  );

  if (!response) {
    bridgeWarn('书签编辑无响应，收藏夹状态未知', { ops: ops.length });
    return { status: 'error', results: [], bookmarks: [], folders: [], health: {} };
  }

  const failed = response.results.filter((result) => !result.ok).length;
  bridgeLog('书签编辑回执', { total: response.results.length, failed });
  return {
    status: response.ok ? 'ok' : 'error',
    results: response.results,
    bookmarks: response.bookmarks,
    folders: response.folders,
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
      folders: event.data.folders ?? [],
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
