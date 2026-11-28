import type { Bookmark, BookmarkFolder } from '@qianxu/shared';

export const ALL_FOLDERS = '__all__';
export const UNGROUPED_KEY = '__ungrouped__';

export interface FolderStat {
  /** 文件夹节点 id；UNGROUPED_KEY 表示不在任何用户文件夹里 */
  key: string;
  label: string;
  /** 含默认容器的完整路径，用来区分「书签栏/开发」和「其他书签/开发」 */
  hint: string;
  count: number;
}

export interface BookmarkGroup {
  key: string;
  label: string;
  bookmarks: Bookmark[];
}

export interface FolderIndex {
  byId: Map<string, BookmarkFolder>;
  /** 从 level-1 到该节点自身的文件夹 id 链；默认容器不占层级 */
  chainOf(id: string | undefined): string[];
  /** 第一个默认容器（通常是书签栏），新建顶层文件夹的落点 */
  defaultContainerId: string | undefined;
}

export function createFolderIndex(nodes: BookmarkFolder[]): FolderIndex {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const cache = new Map<string, string[]>();

  const chainOf = (id: string | undefined): string[] => {
    if (!id) return [];
    const cached = cache.get(id);
    if (cached) return cached;
    const node = byId.get(id);
    // 走到默认容器就停：书签栏、其他书签不算作一层
    if (!node || node.builtin) {
      cache.set(id, []);
      return [];
    }
    const chain = [...chainOf(node.parentId), id];
    cache.set(id, chain);
    return chain;
  };

  return {
    byId,
    chainOf,
    defaultContainerId: nodes.find((node) => node.builtin)?.id,
  };
}

/** depth 从 1 开始；书签没深入到该层时归入未分组 */
export function levelKeyOf(bookmark: Bookmark, index: FolderIndex, depth: number): string {
  return index.chainOf(bookmark.folderId)[depth - 1] ?? UNGROUPED_KEY;
}

export function folderLabelOf(
  key: string,
  index: FolderIndex,
  ungroupedLabel: string,
): string {
  if (key === UNGROUPED_KEY) return ungroupedLabel;
  return index.byId.get(key)?.title || ungroupedLabel;
}

/** 标题为空的文件夹给个可辨认的占位名，而不是留一片空白 */
export function folderHintOf(key: string, index: FolderIndex, ungroupedLabel: string): string {
  if (key === UNGROUPED_KEY) return ungroupedLabel;
  const titles = index
    .chainOf(key)
    .map((id) => index.byId.get(id)?.title)
    .filter((title): title is string => Boolean(title));
  const container = index.byId.get(index.byId.get(key)?.parentId ?? '');
  const prefix = container?.builtin ? [container.title, ...titles] : titles;
  return prefix.join(' / ');
}

export function compareFolders(a: { key: string; label: string }, b: { key: string; label: string }): number {
  if (a.key === UNGROUPED_KEY) return 1;
  if (b.key === UNGROUPED_KEY) return -1;
  return a.label.localeCompare(b.label, 'zh-Hans-CN');
}

/**
 * 某一层的文件夹统计。
 *
 * 空文件夹也要进结果：只从书签反推的话，刚建好的文件夹在侧栏里根本看不见，
 * 用户会以为没建成功。under 用来把二级统计限制在当前一级文件夹内。
 */
export function buildFolderStats(
  nodes: BookmarkFolder[],
  bookmarks: Bookmark[],
  index: FolderIndex,
  depth: number,
  ungroupedLabel: string,
  under?: string,
): FolderStat[] {
  const counts = new Map<string, number>();

  for (const node of nodes) {
    if (node.builtin) continue;
    const chain = index.chainOf(node.id);
    const key = chain[depth - 1];
    if (!key) continue;
    if (under !== undefined && chain[depth - 2] !== under) continue;
    counts.set(key, counts.get(key) ?? 0);
  }

  for (const bookmark of bookmarks) {
    const key = levelKeyOf(bookmark, index, depth);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return [...counts]
    .map(([key, count]) => ({
      key,
      label: folderLabelOf(key, index, ungroupedLabel),
      hint: folderHintOf(key, index, ungroupedLabel),
      count,
    }))
    .sort(compareFolders);
}

export function groupByFolder(
  list: Bookmark[],
  index: FolderIndex,
  depth: number,
  ungroupedLabel: string,
): BookmarkGroup[] {
  const groups = new Map<string, BookmarkGroup>();

  for (const bookmark of list) {
    const key = levelKeyOf(bookmark, index, depth);
    const group = groups.get(key);
    if (group) {
      group.bookmarks.push(bookmark);
    } else {
      groups.set(key, {
        key,
        label: folderLabelOf(key, index, ungroupedLabel),
        bookmarks: [bookmark],
      });
    }
  }

  return [...groups.values()].sort(compareFolders);
}

/** 搜索仍然按标题匹配：用户搜的是看得见的名字，不是节点 id */
export function folderTitlesOf(bookmark: Bookmark): string[] {
  if (bookmark.folderPath?.length) return bookmark.folderPath;
  return bookmark.folder ? [bookmark.folder] : [];
}

export interface MoveTarget {
  id: string;
  label: string;
  /** 0 是顶层（默认容器或一级文件夹），1 是二级文件夹 */
  depth: number;
}

const byTitle = (a: BookmarkFolder, b: BookmarkFolder) =>
  a.title.localeCompare(b.title, 'zh-Hans-CN');

/**
 * 「移动到…」的候选列表。
 *
 * 只铺两级：页面只导航两级，把三级文件夹放进列表等于把书签藏进一个用户到不了的地方。
 * 顶层容器也放进去——它是「不分组」的真实落点，没有它就只能往文件夹里挪、挪不出来。
 */
export function buildMoveTargets(nodes: BookmarkFolder[], index: FolderIndex): MoveTarget[] {
  const userFolders = nodes.filter((node) => !node.builtin);
  const topLevel = userFolders
    .filter((node) => index.chainOf(node.id).length === 1)
    .sort(byTitle);

  const targets: MoveTarget[] = [];
  const container = nodes.find((node) => node.builtin);
  if (container) {
    targets.push({ id: container.id, label: `${container.title}（不分组）`, depth: 0 });
  }

  for (const folder of topLevel) {
    targets.push({ id: folder.id, label: folder.title, depth: 0 });
    for (const child of userFolders.filter((node) => node.parentId === folder.id).sort(byTitle)) {
      targets.push({ id: child.id, label: child.title, depth: 1 });
    }
  }

  return targets;
}
