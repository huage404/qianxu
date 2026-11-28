import { isHttpUrl, type Bookmark, type BookmarkFolder } from '@qianxu/shared';

export interface BookmarkNode {
  id: string;
  title?: string;
  url?: string;
  parentId?: string;
  dateAdded?: number | Date;
  children?: BookmarkNode[];
}

export interface FlatBookmarkTree {
  bookmarks: Bookmark[];
  folders: BookmarkFolder[];
}

/**
 * 把书签树摊平成「书签 + 文件夹节点」两张表。
 *
 * 文件夹必须带着 id 一起出去：标题路径不足以区分「书签栏/开发」和
 * 「其他书签/开发」，而重命名、移动、删除都得指名到具体节点。
 */
export function flattenBookmarkTree(tree: BookmarkNode[]): FlatBookmarkTree {
  const bookmarks: Bookmark[] = [];
  const folders: BookmarkFolder[] = [];

  const walk = (
    children: BookmarkNode[],
    path: string[],
    parentId: string,
    parentIsRoot: boolean,
  ) => {
    for (const node of children) {
      if (node.url) {
        if (!isHttpUrl(node.url)) continue;
        const title = node.title?.trim();
        bookmarks.push({
          id: node.id,
          title: title || node.url,
          url: node.url,
          folderId: parentId,
          folder: path[path.length - 1],
          folderPath: path.length > 0 ? path : undefined,
          createdAt: timestampOf(node.dateAdded),
        });
        continue;
      }

      const title = node.title?.trim() ?? '';
      // 根节点的直接子节点就是书签栏、其他书签这类默认容器，不可改名也不可删。
      // 只认遍历出来的父子关系，不读 node.parentId 字段，免得两处身份来源对不上。
      const builtin = parentIsRoot;
      // 默认容器和不带名的文件夹都不进路径，维持页面原有的分组观感
      const ownPath = builtin || !title ? path : [...path, title];
      folders.push({ id: node.id, title, parentId, builtin, path: ownPath });
      walk(node.children ?? [], ownPath, node.id, false);
    }
  };

  // 根节点只是书签树的外壳，不是一张可编辑的文件夹，所以它自己不进表
  for (const root of tree) walk(root.children ?? [], [], root.id, true);

  return { bookmarks, folders };
}

function timestampOf(value: number | Date | undefined): number {
  if (typeof value === 'number') return value;
  if (value instanceof Date) return value.getTime();
  return 0;
}
