import { isHttpUrl, type Bookmark } from '@qianxu/shared';

export interface BookmarkNode {
  id: string;
  title?: string;
  url?: string;
  parentId?: string;
  dateAdded?: number | Date;
  children?: BookmarkNode[];
}

export function flattenBookmarkTree(tree: BookmarkNode[]): Bookmark[] {
  const bookmarks: Bookmark[] = [];
  const rootId = tree[0]?.id;

  const walk = (nodes: BookmarkNode[], path: string[]) => {
    for (const node of nodes) {
      if (node.url) {
        if (!isHttpUrl(node.url)) continue;
        const title = node.title?.trim();
        bookmarks.push({
          id: node.id,
          title: title || node.url,
          url: node.url,
          folder: path[path.length - 1],
          folderPath: path.length > 0 ? path : undefined,
          createdAt: timestampOf(node.dateAdded),
        });
        continue;
      }

      if (!node.children) continue;
      const isRootOrDefaultContainer = node.parentId === undefined || node.parentId === rootId;
      const title = node.title?.trim();
      walk(node.children, isRootOrDefaultContainer || !title ? path : [...path, title]);
    }
  };

  walk(tree, []);
  return bookmarks;
}

function timestampOf(value: number | Date | undefined): number {
  if (typeof value === 'number') return value;
  if (value instanceof Date) return value.getTime();
  return 0;
}
