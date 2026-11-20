export interface Bookmark {
  id: string;
  title: string;
  url: string;
  folder?: string;
  /** 浏览器默认容器（书签栏、其他书签等）之下的完整文件夹路径 */
  folderPath?: string[];
  createdAt: number;
}

export const BOOKMARKS_STORAGE_KEY = 'bookmarks';

export const MSG_SOURCE_WEB = 'qianxu:web';
export const MSG_SOURCE_EXT = 'qianxu:ext';

export interface BookmarksRequest {
  source: typeof MSG_SOURCE_WEB;
  type: 'BOOKMARKS_REQUEST';
  requestId: string;
}

export interface BookmarksResponse {
  source: typeof MSG_SOURCE_EXT;
  type: 'BOOKMARKS_RESPONSE';
  requestId: string;
  bookmarks: Bookmark[];
}

export interface BookmarksUpdated {
  source: typeof MSG_SOURCE_EXT;
  type: 'BOOKMARKS_UPDATED';
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
    Array.isArray(msg.bookmarks)
  );
}

export function isBookmarksUpdated(value: unknown): value is BookmarksUpdated {
  if (typeof value !== 'object' || value === null) return false;
  const msg = value as Record<string, unknown>;
  return (
    msg.source === MSG_SOURCE_EXT &&
    msg.type === 'BOOKMARKS_UPDATED' &&
    Array.isArray(msg.bookmarks)
  );
}

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}
