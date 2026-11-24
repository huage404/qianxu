import { isHttpUrl, type Bookmark } from '@qianxu/shared';

import { createId } from '@/lib/id';

export function parseBookmarksJson(text: string): Bookmark[] | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }

  let rawList: unknown[] | null = null;
  if (Array.isArray(data)) {
    rawList = data;
  } else if (typeof data === 'object' && data !== null) {
    const nested = (data as { bookmarks?: unknown }).bookmarks;
    if (Array.isArray(nested)) rawList = nested;
  }
  if (!rawList) return null;

  const bookmarks: Bookmark[] = [];
  for (const raw of rawList) {
    if (typeof raw !== 'object' || raw === null) continue;
    const item = raw as Record<string, unknown>;
    if (typeof item.url !== 'string' || !isHttpUrl(item.url)) continue;

    const folderPath = Array.isArray(item.folderPath)
      ? item.folderPath
          .filter((segment): segment is string => typeof segment === 'string')
          .map((segment) => segment.trim())
          .filter((segment) => segment.length > 0)
      : [];
    const folder =
      typeof item.folder === 'string' && item.folder.trim()
        ? item.folder.trim()
        : folderPath[folderPath.length - 1];

    bookmarks.push({
      id: typeof item.id === 'string' && item.id ? item.id : createId(),
      title:
        typeof item.title === 'string' && item.title.trim() ? item.title.trim() : item.url,
      url: item.url,
      folder,
      folderPath: folderPath.length > 0 ? folderPath : undefined,
      createdAt: typeof item.createdAt === 'number' ? item.createdAt : Date.now(),
    });
  }

  return bookmarks.length > 0 ? bookmarks : null;
}
