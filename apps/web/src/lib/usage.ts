import type { Bookmark } from '@qianxu/shared';

export type SortMode = 'recent' | 'frequent';

export interface ClickStat {
  /** 按半衰期折算到 lastClickedAt 时刻的累计权重 */
  weight: number;
  lastClickedAt: number;
}

export type ClickStats = Record<string, ClickStat>;

const CLICK_STORAGE_KEY = 'qianxu:bookmark-clicks';
const SORT_STORAGE_KEY = 'qianxu:bookmark-sort';
const HALF_LIFE_MS = 30 * 24 * 60 * 60 * 1000;

function decayFactor(elapsedMs: number): number {
  if (elapsedMs <= 0) return 1;
  return Math.pow(0.5, elapsedMs / HALF_LIFE_MS);
}

export function loadClickStats(): ClickStats {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(CLICK_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return {};

    const stats: ClickStats = {};
    for (const [url, value] of Object.entries(parsed)) {
      if (typeof value !== 'object' || value === null) continue;
      const { weight, lastClickedAt } = value as Record<string, unknown>;
      if (typeof weight !== 'number' || !Number.isFinite(weight) || weight <= 0) continue;
      if (typeof lastClickedAt !== 'number' || !Number.isFinite(lastClickedAt)) continue;
      stats[url] = { weight, lastClickedAt };
    }
    return stats;
  } catch {
    return {};
  }
}

export function saveClickStats(stats: ClickStats): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CLICK_STORAGE_KEY, JSON.stringify(stats));
  } catch {
    // 存储不可用（隐私模式、配额）时放弃持久化，不影响本次排序
  }
}

export function recordClick(stats: ClickStats, url: string, now = Date.now()): ClickStats {
  const prev = stats[url];
  const weight = prev ? prev.weight * decayFactor(now - prev.lastClickedAt) + 1 : 1;
  return { ...stats, [url]: { weight, lastClickedAt: now } };
}

export function usageScore(stat: ClickStat | undefined, now = Date.now()): number {
  if (!stat) return 0;
  return stat.weight * decayFactor(now - stat.lastClickedAt);
}

export function loadSortMode(): SortMode {
  if (typeof window === 'undefined') return 'recent';
  try {
    return window.localStorage.getItem(SORT_STORAGE_KEY) === 'frequent' ? 'frequent' : 'recent';
  } catch {
    return 'recent';
  }
}

export function saveSortMode(mode: SortMode): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SORT_STORAGE_KEY, mode);
  } catch {
    // 同上，持久化失败只影响下次打开时的默认排序
  }
}

export function sortBookmarks(
  list: Bookmark[],
  mode: SortMode,
  stats: ClickStats,
): Bookmark[] {
  if (mode === 'recent') {
    return [...list].sort((a, b) => b.createdAt - a.createdAt);
  }

  const now = Date.now();
  return list
    .map((bookmark) => {
      const stat = stats[bookmark.url];
      return { bookmark, score: usageScore(stat, now), lastClickedAt: stat?.lastClickedAt ?? 0 };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.lastClickedAt !== a.lastClickedAt) return b.lastClickedAt - a.lastClickedAt;
      return b.bookmark.createdAt - a.bookmark.createdAt;
    })
    .map((entry) => entry.bookmark);
}
