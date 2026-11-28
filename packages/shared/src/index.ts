export interface Bookmark {
  id: string;
  title: string;
  url: string;
  /** 直接父文件夹的节点 id；编辑操作与区分同名文件夹都靠它 */
  folderId?: string;
  folder?: string;
  /** 浏览器默认容器（书签栏、其他书签等）之下的完整文件夹路径 */
  folderPath?: string[];
  createdAt: number;
  /** Chrome 扩展提供的 favicon 地址，由页面直接渲染 */
  faviconUrl?: string;
}

/**
 * 书签树里的文件夹节点。
 * 只靠标题路径无法区分「书签栏/开发」和「其他书签/开发」，
 * 而重命名、移动、删除都必须指名到具体节点，所以身份一律用 id。
 */
export interface BookmarkFolder {
  id: string;
  title: string;
  parentId: string;
  /** 书签栏、其他书签这类浏览器默认容器：不可重命名、不可删除 */
  builtin: boolean;
  /** 默认容器之下的标题路径，仅用于展示层级 */
  path: string[];
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
  /** 旧版本扩展不带该字段，此时页面无法执行编辑操作 */
  folders?: BookmarkFolder[];
}

export interface BookmarksUpdated {
  source: typeof MSG_SOURCE_EXT;
  type: 'BOOKMARKS_UPDATED';
  /** 读取收藏夹是否成功；旧版本扩展不带该字段，视为成功 */
  ok?: boolean;
  bookmarks: Bookmark[];
  health?: LinkHealthMap;
  folders?: BookmarkFolder[];
}

/** 轮询完成与书签变更是两件事，否则后台测完要等重开页面才更新 */
export interface HealthUpdated {
  source: typeof MSG_SOURCE_EXT;
  type: 'HEALTH_UPDATED';
  health: LinkHealthMap;
}

/**
 * 一次书签编辑。批量提交，逐条回执。
 * 每个 op 都指向节点 id，页面不能靠标题猜目标。
 */
export type BookmarkOp =
  | { kind: 'rename'; id: string; title: string }
  | { kind: 'setUrl'; id: string; url: string }
  | { kind: 'move'; id: string; intoFolderId: string }
  | { kind: 'remove'; id: string }
  | { kind: 'removeFolder'; id: string }
  | { kind: 'createFolder'; title: string; parentId: string };

/** 单次请求的操作上限，够全选删除两百多个书签，同时拦住失控的批量写入 */
export const MAX_OPS_PER_REQUEST = 500;

export interface BookmarksMutateRequest {
  source: typeof MSG_SOURCE_WEB;
  type: 'BOOKMARKS_MUTATE';
  requestId: string;
  ops: BookmarkOp[];
}

export interface BookmarkOpResult {
  ok: boolean;
  /** 失败原因，供页面逐条提示；成功时可能带上服务端实际写入的标题或链接 */
  error?: string;
}

export interface BookmarksMutateResponse {
  source: typeof MSG_SOURCE_EXT;
  type: 'BOOKMARKS_MUTATE_RESPONSE';
  requestId: string;
  /** 整批是否被接受；单条失败不影响它，见 results */
  ok: boolean;
  results: BookmarkOpResult[];
  bookmarks: Bookmark[];
  folders: BookmarkFolder[];
  health?: LinkHealthMap;
}

export type WebToExtensionMessage = BookmarksRequest | BookmarksMutateRequest;
export type ExtensionToWebMessage =
  | BookmarksResponse
  | BookmarksUpdated
  | HealthUpdated
  | BookmarksMutateResponse;

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
    isOptionalHealthMap(msg.health) &&
    isOptionalFolderList(msg.folders)
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
    isOptionalHealthMap(msg.health) &&
    isOptionalFolderList(msg.folders)
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

/**
 * 写入请求的守卫。这条通道会改动用户真实的浏览器书签，
 * 所以逐个 op 校验形状，而不是只看 Array.isArray。
 */
export function isBookmarksMutateRequest(value: unknown): value is BookmarksMutateRequest {
  if (typeof value !== 'object' || value === null) return false;
  const msg = value as Record<string, unknown>;
  return (
    msg.source === MSG_SOURCE_WEB &&
    msg.type === 'BOOKMARKS_MUTATE' &&
    typeof msg.requestId === 'string' &&
    msg.requestId.length > 0 &&
    Array.isArray(msg.ops) &&
    msg.ops.length > 0 &&
    msg.ops.length <= MAX_OPS_PER_REQUEST &&
    (msg.ops as unknown[]).every(isBookmarkOp)
  );
}

export function isBookmarksMutateResponse(value: unknown): value is BookmarksMutateResponse {
  if (typeof value !== 'object' || value === null) return false;
  const msg = value as Record<string, unknown>;
  return (
    msg.source === MSG_SOURCE_EXT &&
    msg.type === 'BOOKMARKS_MUTATE_RESPONSE' &&
    typeof msg.requestId === 'string' &&
    typeof msg.ok === 'boolean' &&
    Array.isArray(msg.results) &&
    (msg.results as unknown[]).every(isBookmarkOpResult) &&
    Array.isArray(msg.bookmarks) &&
    Array.isArray(msg.folders) &&
    isOptionalHealthMap(msg.health)
  );
}

export function isBookmarkOp(value: unknown): value is BookmarkOp {
  if (typeof value !== 'object' || value === null) return false;
  const op = value as Record<string, unknown>;
  switch (op.kind) {
    case 'rename':
      return typeof op.id === 'string' && typeof op.title === 'string';
    case 'setUrl':
      return typeof op.id === 'string' && typeof op.url === 'string';
    case 'move':
      return typeof op.id === 'string' && typeof op.intoFolderId === 'string';
    case 'remove':
    case 'removeFolder':
      return typeof op.id === 'string';
    case 'createFolder':
      return typeof op.title === 'string' && typeof op.parentId === 'string';
    default:
      return false;
  }
}

function isBookmarkOpResult(value: unknown): value is BookmarkOpResult {
  if (typeof value !== 'object' || value === null) return false;
  const result = value as Record<string, unknown>;
  return (
    typeof result.ok === 'boolean' &&
    (result.error === undefined || typeof result.error === 'string')
  );
}

function isBookmarkFolder(value: unknown): value is BookmarkFolder {
  if (typeof value !== 'object' || value === null) return false;
  const folder = value as Record<string, unknown>;
  return (
    typeof folder.id === 'string' &&
    typeof folder.title === 'string' &&
    typeof folder.parentId === 'string' &&
    typeof folder.builtin === 'boolean' &&
    Array.isArray(folder.path) &&
    folder.path.every((segment) => typeof segment === 'string')
  );
}

function isOptionalFolderList(value: unknown): boolean {
  return value === undefined || (Array.isArray(value) && value.every(isBookmarkFolder));
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
