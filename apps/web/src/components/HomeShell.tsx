'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Bookmark } from '@qianxu/shared';
import {
  BookmarkPlus,
  Clock3,
  Download,
  FileJson,
  Folder,
  LockKeyhole,
  Puzzle,
  SearchX,
  TrendingUp,
  TriangleAlert,
} from 'lucide-react';

import { BookmarkCard } from '@/components/BookmarkCard';
import { BookmarkFilter } from '@/components/BookmarkFilter';
import { BookmarksSidebar, type FolderStat } from '@/components/BookmarksSidebar';
import { EmptyState } from '@/components/EmptyState';
import { SearchBar } from '@/components/SearchBar';
import { TopNav } from '@/components/TopNav';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { requestBookmarks, subscribeBookmarks } from '@/lib/bridge';
import { EXTENSION_DOWNLOAD_URL } from '@/lib/constants';
import { parseBookmarksJson } from '@/lib/import';
import {
  loadClickStats,
  loadSortMode,
  recordClick,
  saveClickStats,
  saveSortMode,
  sortBookmarks,
  type ClickStats,
  type SortMode,
} from '@/lib/usage';
import { cn } from '@/lib/utils';

type Status = 'checking' | 'connected' | 'absent' | 'error';

const ALL_FOLDERS = '__all__';
const UNGROUPED_KEY = '__ungrouped__';
const TILE_GRID = 'grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4';

interface BookmarkGroup {
  key: string;
  label: string;
  bookmarks: Bookmark[];
}

function folderPathOf(bookmark: Bookmark): string[] {
  if (bookmark.folderPath?.length) return bookmark.folderPath;
  return bookmark.folder ? [bookmark.folder] : [];
}

/** depth 从 1 开始；书签没深入到该层时归入未分组 */
function folderKeyAt(bookmark: Bookmark, depth: number): string {
  return folderPathOf(bookmark)[depth - 1] ?? UNGROUPED_KEY;
}

function folderLabelOf(key: string, ungroupedLabel: string): string {
  return key === UNGROUPED_KEY ? ungroupedLabel : key;
}

function compareFolders(a: { key: string; label: string }, b: { key: string; label: string }): number {
  if (a.key === UNGROUPED_KEY) return 1;
  if (b.key === UNGROUPED_KEY) return -1;
  return a.label.localeCompare(b.label, 'zh-Hans-CN');
}

function buildFolderStats(
  list: Bookmark[],
  depth: number,
  ungroupedLabel: string,
): FolderStat[] {
  const counts = new Map<string, number>();

  for (const bookmark of list) {
    const key = folderKeyAt(bookmark, depth);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return [...counts]
    .map(([key, count]) => ({ key, label: folderLabelOf(key, ungroupedLabel), count }))
    .sort(compareFolders);
}

function groupByFolder(
  list: Bookmark[],
  depth: number,
  ungroupedLabel: string,
): BookmarkGroup[] {
  const groups = new Map<string, BookmarkGroup>();

  for (const bookmark of list) {
    const key = folderKeyAt(bookmark, depth);
    const group = groups.get(key);
    if (group) {
      group.bookmarks.push(bookmark);
    } else {
      groups.set(key, {
        key,
        label: folderLabelOf(key, ungroupedLabel),
        bookmarks: [bookmark],
      });
    }
  }

  return [...groups.values()].sort(compareFolders);
}

function matchesQuery(bookmark: Bookmark, query: string): boolean {
  if (!query) return true;
  const haystack = [bookmark.title, bookmark.url, ...folderPathOf(bookmark)]
    .join(' ')
    .toLowerCase();
  return haystack.includes(query);
}

interface HomeShellProps {
  icpNumber?: string;
}

export function HomeShell({ icpNumber }: HomeShellProps) {
  const [status, setStatus] = useState<Status>('checking');
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [fromFile, setFromFile] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [activeFolder, setActiveFolder] = useState<string>(ALL_FOLDERS);
  const [activeSubfolder, setActiveSubfolder] = useState<string>(ALL_FOLDERS);
  const [sortMode, setSortMode] = useState<SortMode>('recent');
  const [clickStats, setClickStats] = useState<ClickStats>({});

  const clickStatsRef = useRef<ClickStats>({});
  const fromFileRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const desktopFilterRef = useRef<HTMLInputElement>(null);
  const mobileFilterRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const storedStats = loadClickStats();
    clickStatsRef.current = storedStats;
    setClickStats(storedStats);
    setSortMode(loadSortMode());
  }, []);

  const loadFromExtension = useCallback(async () => {
    setStatus('checking');
    setImportError(null);
    const result = await requestBookmarks();
    if (result.status !== 'ok') {
      setStatus(result.status);
      return;
    }
    setStatus('connected');
    setFromFile(false);
    fromFileRef.current = false;
    setBookmarks(result.bookmarks);
  }, []);

  useEffect(() => {
    void loadFromExtension();
    return subscribeBookmarks((update) => {
      // 浏览文件导入的数据时，不让后台推送悄悄替换当前列表
      if (fromFileRef.current) return;
      if (!update.ok) {
        setStatus('error');
        return;
      }
      setStatus('connected');
      setImportError(null);
      setBookmarks(update.bookmarks);
    });
  }, [loadFromExtension]);

  const ordered = useMemo(
    () => sortBookmarks(bookmarks, sortMode, clickStats),
    [bookmarks, sortMode, clickStats],
  );

  const folders = useMemo(() => buildFolderStats(bookmarks, 1, '未分组'), [bookmarks]);

  useEffect(() => {
    if (activeFolder !== ALL_FOLDERS && !folders.some((folder) => folder.key === activeFolder)) {
      setActiveFolder(ALL_FOLDERS);
    }
  }, [folders, activeFolder]);

  // 一级文件夹内的书签，用于二级统计与二级筛选
  const folderScoped = useMemo(
    () =>
      activeFolder === ALL_FOLDERS
        ? bookmarks
        : bookmarks.filter((bookmark) => folderKeyAt(bookmark, 1) === activeFolder),
    [bookmarks, activeFolder],
  );

  const subfolders = useMemo(
    () =>
      activeFolder === ALL_FOLDERS ? [] : buildFolderStats(folderScoped, 2, '本级'),
    [folderScoped, activeFolder],
  );

  useEffect(() => {
    if (activeFolder === ALL_FOLDERS || activeSubfolder === ALL_FOLDERS) return;
    if (!subfolders.some((subfolder) => subfolder.key === activeSubfolder)) {
      setActiveSubfolder(ALL_FOLDERS);
    }
  }, [subfolders, activeFolder, activeSubfolder]);

  const normalizedQuery = query.trim().toLowerCase();

  const visible = useMemo(() => {
    const scoped = ordered.filter(
      (bookmark) =>
        (activeFolder === ALL_FOLDERS || folderKeyAt(bookmark, 1) === activeFolder) &&
        (activeFolder === ALL_FOLDERS ||
          activeSubfolder === ALL_FOLDERS ||
          folderKeyAt(bookmark, 2) === activeSubfolder),
    );
    if (!normalizedQuery) return scoped;
    return scoped.filter((bookmark) => matchesQuery(bookmark, normalizedQuery));
  }, [ordered, activeFolder, activeSubfolder, normalizedQuery]);

  const groupDepth = activeFolder === ALL_FOLDERS ? 1 : 2;
  const groups = useMemo(
    () =>
      sortMode === 'recent' && !normalizedQuery
        ? groupByFolder(visible, groupDepth, groupDepth === 1 ? '未分组' : '本级')
        : [],
    [sortMode, normalizedQuery, visible, groupDepth],
  );
  // 只有一个分组时分组标题纯属噪音，直接平铺
  const showGroups = groups.length > 1;

  const total = bookmarks.length;
  const hasClickData = useMemo(
    () => bookmarks.some((bookmark) => clickStats[bookmark.url] !== undefined),
    [bookmarks, clickStats],
  );
  const checking = status === 'checking';
  const isEmpty = total === 0;
  const filteredEmpty = !isEmpty && visible.length === 0;
  const activeFolderLabel =
    activeFolder === ALL_FOLDERS
      ? '全部书签'
      : folderLabelOf(activeFolder, '未分组') +
        (activeSubfolder === ALL_FOLDERS
          ? ''
          : ` / ${folderLabelOf(activeSubfolder, '本级')}`);

  const selectFolder = (key: string) => {
    setActiveFolder(key);
    setActiveSubfolder(ALL_FOLDERS);
  };

  const openFilePicker = () => fileInputRef.current?.click();

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    const parsed = parseBookmarksJson(await file.text());
    if (!parsed) {
      setImportError('无法解析书签文件，请确认是 JSON 格式且包含有效的 http(s) 链接。');
      return;
    }
    setImportError(null);
    setFromFile(true);
    fromFileRef.current = true;
    setQuery('');
    setActiveFolder(ALL_FOLDERS);
    setActiveSubfolder(ALL_FOLDERS);
    setBookmarks(parsed);
  };

  const handleOpenBookmark = useCallback((bookmark: Bookmark) => {
    const next = recordClick(clickStatsRef.current, bookmark.url);
    clickStatsRef.current = next;
    saveClickStats(next);
    setClickStats(next);
  }, []);

  const handleSortModeChange = (mode: SortMode) => {
    setSortMode(mode);
    saveSortMode(mode);
  };

  const clearFilters = () => {
    setQuery('');
    setActiveFolder(ALL_FOLDERS);
    setActiveSubfolder(ALL_FOLDERS);
  };

  useEffect(() => {
    const focusFilter = () => {
      const desktop = desktopFilterRef.current;
      const target =
        desktop && desktop.offsetParent !== null ? desktop : mobileFilterRef.current;
      if (!target) return false;
      target.focus();
      target.select();
      return true;
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        focusFilter();
        return;
      }
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;

      const target = event.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);
      if (typing) return;
      if (focusFilter()) event.preventDefault();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const liveMessage = checking
    ? '正在检测书签插件…'
    : fromFile
      ? `已从文件导入 ${total} 个书签`
      : status === 'connected'
        ? normalizedQuery || visible.length !== total
          ? `筛选出 ${visible.length} 个书签`
          : `已加载 ${total} 个收藏`
        : status === 'error'
          ? '读取浏览器收藏夹失败'
          : '未检测到书签插件';

  return (
    <div className="flex min-h-dvh flex-col lg:h-dvh lg:overflow-hidden">
      <TopNav
        query={query}
        onQueryChange={setQuery}
        filterRef={desktopFilterRef}
        onImport={openFilePicker}
        onRefresh={loadFromExtension}
        checking={checking}
      />

      <div className="relative mx-auto flex w-full max-w-[1200px] flex-1 flex-col px-5 sm:px-8 lg:min-h-0 lg:flex-row lg:gap-10 lg:overflow-hidden">
        {total > 0 && (
          <BookmarksSidebar
            folders={folders}
            total={total}
            activeFolder={activeFolder}
            onSelectFolder={selectFolder}
            allKey={ALL_FOLDERS}
          />
        )}

        <main className="min-w-0 flex-1 pt-10 pb-14 sm:pt-12 lg:h-full lg:overflow-y-auto lg:pt-10 lg:pb-10">
          <div className="mx-auto w-full max-w-2xl">
            <SearchBar />
          </div>

          <section className="mt-12 sm:mt-14" aria-label="书签">
            {total > 0 && (
              <div className="flex items-center gap-2 lg:hidden">
                <BookmarkFilter
                  value={query}
                  onChange={setQuery}
                  inputRef={mobileFilterRef}
                  className="min-w-0 flex-1"
                />
                <Select value={activeFolder} onValueChange={selectFolder}>
                  <SelectTrigger
                    aria-label="选择文件夹"
                    className="h-9 w-[132px] shrink-0 text-[13px]"
                  >
                    <SelectValue className="truncate" />
                  </SelectTrigger>
                  <SelectContent align="end" className="max-w-[240px]">
                    <SelectItem value={ALL_FOLDERS}>全部书签</SelectItem>
                    {folders.map((folder) => (
                      <SelectItem key={folder.key} value={folder.key}>
                        {folder.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="mt-6 flex items-center justify-between gap-3 lg:mt-0">
              <h2 className="text-[13px] font-medium text-muted-foreground">
                {activeFolderLabel}
              </h2>
              <div className="flex items-center gap-3">
                {total > 0 && (
                  <SortToggle mode={sortMode} onChange={handleSortModeChange} />
                )}
                {fromFile && (
                  <Badge
                    variant="outline"
                    className="border-dashed px-1.5 py-0 text-[10px] font-normal text-muted-foreground"
                  >
                    来自文件
                  </Badge>
                )}
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {normalizedQuery || activeFolder !== ALL_FOLDERS
                    ? `${visible.length} / ${total} 个`
                    : `${total} 个`}
                </span>
              </div>
            </div>

            {total > 0 && activeFolder !== ALL_FOLDERS && subfolders.length > 1 && (
              <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="二级文件夹">
                <SubfolderChip
                  label="全部"
                  count={folderScoped.length}
                  active={activeSubfolder === ALL_FOLDERS}
                  onSelect={() => setActiveSubfolder(ALL_FOLDERS)}
                />
                {subfolders.map((subfolder) => (
                  <SubfolderChip
                    key={subfolder.key}
                    label={subfolder.label}
                    count={subfolder.count}
                    active={activeSubfolder === subfolder.key}
                    onSelect={() => setActiveSubfolder(subfolder.key)}
                  />
                ))}
              </div>
            )}

            <p className="sr-only" role="status">
              {liveMessage}
            </p>

            {sortMode === 'frequent' && total > 0 && !hasClickData && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                常用排序按点击次数计算，打开几个书签后就会生效。
              </p>
            )}

            {importError && (
              <div
                role="alert"
                className="mt-5 flex items-start gap-2.5 rounded-xl border border-destructive/30 bg-destructive/8 px-4 py-3 text-[13px] leading-relaxed text-destructive"
              >
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                <p>{importError}</p>
              </div>
            )}

            {status === 'error' && total > 0 && !fromFile && (
              <div
                role="alert"
                className="mt-5 flex items-center gap-2.5 rounded-xl border border-destructive/30 bg-destructive/8 px-4 py-3 text-[13px] leading-relaxed text-destructive"
              >
                <TriangleAlert className="size-4 shrink-0" />
                <p className="min-w-0 flex-1">读取浏览器收藏夹失败，当前显示上次加载的数据。</p>
                <button
                  type="button"
                  onClick={loadFromExtension}
                  className="shrink-0 rounded-md border border-destructive/30 px-2 py-0.5 text-[12px] font-medium transition-colors hover:bg-destructive/10 focus-visible:ring-[3px] focus-visible:ring-destructive/30 focus-visible:outline-none"
                >
                  重试
                </button>
              </div>
            )}

            {status === 'absent' && total > 0 && !fromFile && (
              <div
                role="status"
                className="mt-5 flex items-center gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-[13px] leading-relaxed text-amber-700 dark:text-amber-400"
              >
                <TriangleAlert className="size-4 shrink-0" />
                <p className="min-w-0 flex-1">未检测到书签插件，当前显示上次加载的数据。</p>
                <button
                  type="button"
                  onClick={loadFromExtension}
                  className="shrink-0 rounded-md border border-amber-500/30 px-2 py-0.5 text-[12px] font-medium transition-colors hover:bg-amber-500/10 focus-visible:ring-[3px] focus-visible:ring-amber-500/30 focus-visible:outline-none"
                >
                  重新检测
                </button>
              </div>
            )}

            {checking && isEmpty && (
              <div className={cn('mt-5', TILE_GRID)} aria-hidden>
                {Array.from({ length: 8 }, (_, index) => (
                  <div
                    key={index}
                    className="flex flex-col items-center gap-3 rounded-2xl border bg-card px-4 py-5 shadow-xs"
                  >
                    <Skeleton className="size-10 shrink-0 rounded-xl" />
                    <div className="flex w-full flex-col items-center gap-1.5">
                      <Skeleton className="h-3.5 w-3/5" />
                      <Skeleton className="h-3 w-2/5" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {status === 'absent' && isEmpty && (
              <div className="mt-6">
                <EmptyState
                  icon={Puzzle}
                  title="未检测到书签插件"
                  description="安装配套插件后点「重新检测」，或先导入已导出的 JSON 文件。"
                >
                  <Button size="sm" asChild>
                    <a href={EXTENSION_DOWNLOAD_URL}>
                      <Download className="size-3.5" />
                      安装插件
                    </a>
                  </Button>
                  <Button size="sm" variant="outline" onClick={loadFromExtension}>
                    重新检测
                  </Button>
                  <Button size="sm" variant="outline" onClick={openFilePicker}>
                    <FileJson className="size-3.5" />
                    导入 JSON
                  </Button>
                </EmptyState>
              </div>
            )}

            {status === 'error' && isEmpty && (
              <div className="mt-6">
                <EmptyState
                  icon={TriangleAlert}
                  title="读取浏览器收藏夹失败"
                  description="插件已连接，但读取收藏夹时出错。可以重试，或先导入 JSON 文件查看。"
                >
                  <Button size="sm" onClick={loadFromExtension}>
                    重试
                  </Button>
                  <Button size="sm" variant="outline" onClick={openFilePicker}>
                    <FileJson className="size-3.5" />
                    导入 JSON
                  </Button>
                </EmptyState>
              </div>
            )}

            {status === 'connected' && isEmpty && (
              <div className="mt-6">
                <EmptyState
                  icon={BookmarkPlus}
                  title="浏览器收藏夹还是空的"
                  description="在浏览器里收藏任意网页后，回到这里就会看到。"
                />
              </div>
            )}

            {filteredEmpty && (
              <div className="mt-6">
                <EmptyState
                  icon={SearchX}
                  title="没有匹配的书签"
                  description="换个关键词，或清除筛选看看全部书签。"
                >
                  <Button size="sm" variant="outline" onClick={clearFilters}>
                    清除筛选
                  </Button>
                </EmptyState>
              </div>
            )}

            {visible.length > 0 && showGroups && (
              <div className="mt-5 space-y-8">
                {groups.map((group) => (
                  <section key={group.key} aria-label={group.label}>
                    <div className="flex items-baseline gap-2">
                      <h3 className="flex items-center gap-1.5 text-[13px] font-medium">
                        <Folder className="size-3.5 text-muted-foreground" />
                        {group.label}
                      </h3>
                      <span className="text-[11px] tabular-nums text-muted-foreground">
                        {group.bookmarks.length}
                      </span>
                    </div>
                    <div className={cn('mt-3', TILE_GRID)}>
                      {group.bookmarks.map((bookmark) => (
                        <BookmarkCard
                          key={bookmark.id}
                          bookmark={bookmark}
                          onOpen={handleOpenBookmark}
                        />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}

            {visible.length > 0 && !showGroups && (
              <div className={cn('mt-5', TILE_GRID)}>
                {visible.map((bookmark) => (
                  <BookmarkCard
                    key={bookmark.id}
                    bookmark={bookmark}
                    onOpen={handleOpenBookmark}
                  />
                ))}
              </div>
            )}

            {fromFile && (
              <p className="mt-4 text-xs text-muted-foreground">
                点右上角「刷新」可切换回浏览器收藏夹。
              </p>
            )}
          </section>
        </main>
      </div>

      <footer className="flex shrink-0 flex-col items-center justify-center gap-1 px-5 pb-8 text-xs text-muted-foreground">
        <p className="flex items-center gap-1.5">
          <LockKeyhole className="size-3.5" />
          书签与使用记录只留在本地，站点不上传任何数据
        </p>
        {icpNumber && (
          <a
            href="https://beian.miit.gov.cn/"
            target="_blank"
            rel="noreferrer"
            className="rounded-sm underline-offset-2 transition-colors hover:text-foreground hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/30 focus-visible:outline-none"
          >
            {icpNumber}
          </a>
        )}
      </footer>

      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={handleFile}
      />
    </div>
  );
}

function SubfolderChip({
  label,
  count,
  active,
  onSelect,
}: {
  label: string;
  count: number;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onSelect}
      title={label}
      className={cn(
        'flex h-7 max-w-[180px] items-center gap-1.5 rounded-full border px-2.5 text-[12px] transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30',
        active
          ? 'border-transparent bg-accent font-medium text-foreground'
          : 'bg-card text-muted-foreground hover:text-foreground',
      )}
    >
      <span className="truncate">{label}</span>
      <span className="shrink-0 text-[11px] tabular-nums opacity-70">{count}</span>
    </button>
  );
}

const SORT_OPTIONS = [
  { value: 'recent', label: '最新', icon: Clock3 },
  { value: 'frequent', label: '常用', icon: TrendingUp },
] as const satisfies ReadonlyArray<{ value: SortMode; label: string; icon: typeof Clock3 }>;

function SortToggle({
  mode,
  onChange,
}: {
  mode: SortMode;
  onChange: (mode: SortMode) => void;
}) {
  return (
    <div
      role="group"
      aria-label="排序方式"
      className="flex items-center rounded-lg border bg-card p-0.5"
    >
      {SORT_OPTIONS.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          aria-pressed={mode === value}
          onClick={() => onChange(value)}
          className={cn(
            'flex items-center gap-1 rounded-md px-2 py-1 text-[11px] transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30',
            mode === value
              ? 'bg-accent font-medium text-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <Icon className="size-3" />
          {label}
        </button>
      ))}
    </div>
  );
}
