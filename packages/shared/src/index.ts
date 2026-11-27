export interface Bookmark {
  id: string;
  title: string;
  url: string;
  folder?: string;
  /** 浏览器默认容器（书签栏、其他书签等）之下的完整文件夹路径 */
  folderPath?: string[];
  createdAt: number;
  /** Chrome 扩展提供的 favicon 地址，由页面直接渲染 */
  faviconUrl?: string;
}

export const BOOKMARKS_STORAGE_KEY = 'bookmarks';

export const MSG_SOURCE_WEB = 'qianxu:web';
export const MSG_SOURCE_EXT = 'qianxu:ext';

/** 桥接排查日志：在页面控制台执行 localStorage.setItem('qianxu:debug', '1') 后刷新即开启 */
export const BRIDGE_DEBUG_STORAGE_KEY = 'qianxu:debug';
export const BRIDGE_LOG_PREFIX = '[qianxu:bridge]';

export function bridgeLog(...args: unknown[]): void {
  bridgeOutput('info', args);
}

export function bridgeWarn(...args: unknown[]): void {
  bridgeOutput('warn', args);
}

function bridgeOutput(level: 'info' | 'warn', args: unknown[]): void {
  try {
    if (globalThis.localStorage?.getItem(BRIDGE_DEBUG_STORAGE_KEY) !== '1') return;
  } catch {
    return;
  }
  console[level](BRIDGE_LOG_PREFIX, ...args);
}

export interface BookmarksRequest {
  source: typeof MSG_SOURCE_WEB;
  type: 'BOOKMARKS_REQUEST';
  requestId: string;
}

export interface BookmarksResponse {
  source: typeof MSG_SOURCE_EXT;
  type: 'BOOKMARKS_RESPONSE';
  requestId: string;
  /** 读取收藏夹是否成功；旧版本扩展不带该字段，视为成功 */
  ok?: boolean;
  bookmarks: Bookmark[];
  /** 扩展是否已声明接管浏览器新标签页；旧版本不带该字段，视为未接管 */
  newTabOverride?: boolean;
}

export interface BookmarksUpdated {
  source: typeof MSG_SOURCE_EXT;
  type: 'BOOKMARKS_UPDATED';
  /** 读取收藏夹是否成功；旧版本扩展不带该字段，视为成功 */
  ok?: boolean;
  bookmarks: Bookmark[];
}

export type WebToExtensionMessage = BookmarksRequest;
export type ExtensionToWebMessage = BookmarksResponse | BookmarksUpdated;

export function isBookmarksRequest(value: unknown): value is BookmarksRequest {
  if (typeof value !== 'object' || value === null) return false;
  const msg = value as Record<string, unknown>;
  return (
    msg.source === MSG_SOURCE_WEB &&
    msg.type === 'BOOKMARKS_REQUEST' &&
    typeof msg.requestId === 'string' &&
    msg.requestId.length > 0
  );
}

export function isBookmarksResponse(value: unknown): value is BookmarksResponse {
  if (typeof value !== 'object' || value === null) return false;
  const msg = value as Record<string, unknown>;
  return (
    msg.source === MSG_SOURCE_EXT &&
    msg.type === 'BOOKMARKS_RESPONSE' &&
    typeof msg.requestId === 'string' &&
    isOptionalBoolean(msg.ok) &&
    isOptionalBoolean(msg.newTabOverride) &&
    Array.isArray(msg.bookmarks)
  );
}

export function isBookmarksUpdated(value: unknown): value is BookmarksUpdated {
  if (typeof value !== 'object' || value === null) return false;
  const msg = value as Record<string, unknown>;
  return (
    msg.source === MSG_SOURCE_EXT &&
    msg.type === 'BOOKMARKS_UPDATED' &&
    isOptionalBoolean(msg.ok) &&
    Array.isArray(msg.bookmarks)
  );
}

function isOptionalBoolean(value: unknown): boolean {
  return value === undefined || typeof value === 'boolean';
}

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}
