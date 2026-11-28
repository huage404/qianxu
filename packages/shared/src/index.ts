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

/**
 * 链接可访问性分级。
 * unknown 表示从未探测，或本轮因本机断网而无法判定——它不能算作坏链接。
 */
export type LinkStatus = 'ok' | 'suspect' | 'dead' | 'unknown';

export interface LinkHealthRecord {
  status: LinkStatus;
  /** 最近一次实际探测的毫秒时间戳；0 表示从未探测 */
  checkedAt: number;
  /** 探测得到的 HTTP 状态码；网络层失败时缺省 */
  httpStatus?: number;
  reason?: LinkFailureReason;
  /** 连续失败次数，分级升级依据它；探测成功即归零 */
  failures: number;
}

export type LinkFailureReason = 'http' | 'timeout' | 'network' | 'offline';

/** 以书签 URL 为键：收藏夹重新导入后 id 会变，URL 稳定 */
export type LinkHealthMap = Record<string, LinkHealthRecord>;

const LINK_STATUSES: readonly LinkStatus[] = ['ok', 'suspect', 'dead', 'unknown'];
const LINK_FAILURE_REASONS: readonly LinkFailureReason[] = [
  'http',
  'timeout',
  'network',
  'offline',
];

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
  /** 旧版本扩展不带该字段，页面此时不展示健康度 */
  health?: LinkHealthMap;
}

export interface BookmarksUpdated {
  source: typeof MSG_SOURCE_EXT;
  type: 'BOOKMARKS_UPDATED';
  /** 读取收藏夹是否成功；旧版本扩展不带该字段，视为成功 */
  ok?: boolean;
  bookmarks: Bookmark[];
  health?: LinkHealthMap;
}

/** 轮询完成与书签变更是两件事，否则后台测完要等重开页面才更新 */
export interface HealthUpdated {
  source: typeof MSG_SOURCE_EXT;
  type: 'HEALTH_UPDATED';
  health: LinkHealthMap;
}

export type WebToExtensionMessage = BookmarksRequest;
export type ExtensionToWebMessage = BookmarksResponse | BookmarksUpdated | HealthUpdated;

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
    Array.isArray(msg.bookmarks) &&
    isOptionalHealthMap(msg.health)
  );
}

export function isBookmarksUpdated(value: unknown): value is BookmarksUpdated {
  if (typeof value !== 'object' || value === null) return false;
  const msg = value as Record<string, unknown>;
  return (
    msg.source === MSG_SOURCE_EXT &&
    msg.type === 'BOOKMARKS_UPDATED' &&
    isOptionalBoolean(msg.ok) &&
    Array.isArray(msg.bookmarks) &&
    isOptionalHealthMap(msg.health)
  );
}

export function isHealthUpdated(value: unknown): value is HealthUpdated {
  if (typeof value !== 'object' || value === null) return false;
  const msg = value as Record<string, unknown>;
  return (
    msg.source === MSG_SOURCE_EXT &&
    msg.type === 'HEALTH_UPDATED' &&
    isLinkHealthMap(msg.health)
  );
}

function isOptionalBoolean(value: unknown): boolean {
  return value === undefined || typeof value === 'boolean';
}

function isOptionalHealthMap(value: unknown): boolean {
  return value === undefined || isLinkHealthMap(value);
}

export function isLinkHealthMap(value: unknown): value is LinkHealthMap {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  return Object.values(value as Record<string, unknown>).every(isLinkHealthRecord);
}

function isLinkHealthRecord(value: unknown): value is LinkHealthRecord {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    LINK_STATUSES.includes(record.status as LinkStatus) &&
    typeof record.checkedAt === 'number' &&
    typeof record.failures === 'number' &&
    (record.httpStatus === undefined || typeof record.httpStatus === 'number') &&
    (record.reason === undefined ||
      LINK_FAILURE_REASONS.includes(record.reason as LinkFailureReason))
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
