'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  Bookmark,
  BookmarkFolder,
  BookmarkOp,
  LinkHealthMap,
  LinkHealthRecord,
} from '@qianxu/shared';
import {
  BookmarkPlus,
  Clock3,
  Download,
  FileJson,
  Folder,
  LockKeyhole,
  MoreHorizontal,
  PencilLine,
  Puzzle,
  SearchX,
  ShieldCheck,
  TrendingUp,
  TriangleAlert,
} from 'lucide-react';

import { BookmarkCard } from '@/components/BookmarkCard';
import { BookmarkFilter } from '@/components/BookmarkFilter';
import { BookmarksSidebar, type FolderActions } from '@/components/BookmarksSidebar';
import { EditActionBar } from '@/components/EditActionBar';
import { EditModeBanner } from '@/components/EditModeBanner';
import { EmptyState } from '@/components/EmptyState';
import { InlineField } from '@/components/InlineField';
import type { NewTabState } from '@/components/NewTabHint';
import { SearchBar } from '@/components/SearchBar';
import { TopNav } from '@/components/TopNav';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  mutateBookmarks,
  requestBookmarks,
  subscribeBookmarks,
  subscribeHealth,
  type MutateResult,
} from '@/lib/bridge';
import { EXTENSION_DOWNLOAD_URL } from '@/lib/constants';
import {
  ALL_FOLDERS,
  UNGROUPED_KEY,
  buildFolderStats,
  buildMoveTargets,
  createFolderIndex,
  folderLabelOf,
  folderTitlesOf,
  groupByFolder,
  levelKeyOf,
  type BookmarkGroup,
  type FolderStat,
} from '@/lib/folders';
import { dropProps, type DragState } from '@/lib/drag';
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

const TILE_GRID = 'grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4';

function matchesQuery(bookmark: Bookmark, query: string): boolean {
  if (!query) return true;
  const haystack = [bookmark.title, bookmark.url, ...folderTitlesOf(bookmark)]
    .join(' ')
    .toLowerCase();
  return haystack.includes(query);
}

/**
 * 需要关注的链接。suspect 也算进来而不是只挑 dead：
 * 它代表「探测被挡，无法确认」，用户有权知道哪些是自己点开的而不是机器判定的。
 */
function needsAttention(record: LinkHealthRecord | undefined): boolean {
  return record?.status === 'dead' || record?.status === 'suspect';
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
  const [newTabOverride, setNewTabOverride] = useState(false);
  const [health, setHealth] = useState<LinkHealthMap>({});
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [folderNodes, setFolderNodes] = useState<BookmarkFolder[]>([]);
  const [editMode, setEditMode] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [editError, setEditError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [mutating, setMutating] = useState(false);
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(null);

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
    // absent 意味着插件根本没见过，其余两种分支都来自插件的真实应答
    setNewTabOverride(result.status !== 'absent' && result.newTabOverride);
    if (result.status !== 'ok') {
      setStatus(result.status);
      return;
    }
    setStatus('connected');
    setFromFile(false);
    fromFileRef.current = false;
    setBookmarks(result.bookmarks);
    setFolderNodes(result.folders);
    setHealth(result.health);
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
      setFolderNodes(update.folders);
      setHealth(update.health);
    });
  }, [loadFromExtension]);

  useEffect(
    () =>
      subscribeHealth((next) => {
        // 文件导入的书签和收藏夹不是同一批 URL，此时不套用插件的探测结果
        if (fromFileRef.current) return;
        setHealth(next);
      }),
    [],
  );

  const ordered = useMemo(
    () => sortBookmarks(bookmarks, sortMode, clickStats),
    [bookmarks, sortMode, clickStats],
  );

  const folderIndex = useMemo(() => createFolderIndex(folderNodes), [folderNodes]);

  const folders = useMemo(
    () => buildFolderStats(folderNodes, bookmarks, folderIndex, 1, '未分组'),
    [folderNodes, bookmarks, folderIndex],
  );

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
        : bookmarks.filter((bookmark) => levelKeyOf(bookmark, folderIndex, 1) === activeFolder),
    [bookmarks, activeFolder, folderIndex],
  );

  const subfolders = useMemo(
    () =>
      activeFolder === ALL_FOLDERS
        ? []
        : buildFolderStats(folderNodes, folderScoped, folderIndex, 2, '本级', activeFolder),
    [folderNodes, folderScoped, folderIndex, activeFolder],
  );

  useEffect(() => {
    if (activeFolder === ALL_FOLDERS || activeSubfolder === ALL_FOLDERS) return;
    if (!subfolders.some((subfolder) => subfolder.key === activeSubfolder)) {
      setActiveSubfolder(ALL_FOLDERS);
    }
  }, [subfolders, activeFolder, activeSubfolder]);

  const normalizedQuery = query.trim().toLowerCase();

  const attentionCount = useMemo(
    () => bookmarks.filter((bookmark) => needsAttention(health[bookmark.url])).length,
    [bookmarks, health],
  );

  // 坏链接被删掉或复测翻回正常后，不该把用户留在一个空列表里
  useEffect(() => {
    if (attentionOnly && attentionCount === 0) setAttentionOnly(false);
  }, [attentionOnly, attentionCount]);

  const visible = useMemo(() => {
    const scoped = ordered.filter(
      (bookmark) =>
        (activeFolder === ALL_FOLDERS ||
          levelKeyOf(bookmark, folderIndex, 1) === activeFolder) &&
        (activeFolder === ALL_FOLDERS ||
          activeSubfolder === ALL_FOLDERS ||
          levelKeyOf(bookmark, folderIndex, 2) === activeSubfolder) &&
        (!attentionOnly || needsAttention(health[bookmark.url])),
    );
    if (!normalizedQuery) return scoped;
    return scoped.filter((bookmark) => matchesQuery(bookmark, normalizedQuery));
  }, [ordered, activeFolder, activeSubfolder, folderIndex, attentionOnly, health, normalizedQuery]);

  const groupDepth = activeFolder === ALL_FOLDERS ? 1 : 2;
  const groups = useMemo(
    () =>
      sortMode === 'recent' && !normalizedQuery
        ? groupByFolder(visible, folderIndex, groupDepth, groupDepth === 1 ? '未分组' : '本级')
        : [],
    [sortMode, normalizedQuery, visible, folderIndex, groupDepth],
  );
  // 只有一个分组时分组标题纯属噪音，直接平铺
  const showGroups = groups.length > 1;

  const total = bookmarks.length;
  const hasClickData = useMemo(
    () => bookmarks.some((bookmark) => clickStats[bookmark.url] !== undefined),
    [bookmarks, clickStats],
  );
  const checking = status === 'checking';
  const newTabState: NewTabState | null = checking
    ? null
    : status === 'absent'
      ? 'install'
      : newTabOverride
        ? 'taken'
        : 'upgrade';
  const isEmpty = total === 0;
  const filteredEmpty = !isEmpty && visible.length === 0;
  const activeFolderLabel =
    activeFolder === ALL_FOLDERS
      ? '全部书签'
      : folderLabelOf(activeFolder, folderIndex, '未分组') +
        (activeSubfolder === ALL_FOLDERS
          ? ''
          : ` / ${folderLabelOf(activeSubfolder, folderIndex, '本级')}`);

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
    // 文件里的书签没有可写的后端，文件夹节点表对它没有意义
    setFolderNodes([]);
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

  /**
   * 提交一批编辑，并以回执里的新树为准更新页面。
   *
   * 写入一律不重试：请求可能已经生效、只是回执丢了，重发会把同一批操作做两遍。
   * 所以无响应时如实说明状态未知，让用户自己刷新，而不是假装成功。
   */
  const submitOps = useCallback(async (ops: BookmarkOp[]): Promise<MutateResult | null> => {
    if (ops.length === 0) return null;
    setMutating(true);
    setEditError(null);
    const result = await mutateBookmarks(ops);
    setMutating(false);

    if (result.status !== 'ok') {
      setEditError('编辑未能确认，收藏夹可能已经改动。点右上角「刷新」可重新读取真实状态。');
      return null;
    }

    setBookmarks(result.bookmarks);
    setFolderNodes(result.folders);
    setHealth(result.health);
    const failed = result.results.filter((item) => !item.ok);
    if (failed.length > 0) setEditError(failed[0]?.error ?? `${failed.length} 项未能完成`);
    return result;
  }, []);

  const handleRename = useCallback(
    (id: string, title: string) => {
      void submitOps([{ kind: 'rename', id, title }]);
    },
    [submitOps],
  );

  const handleSetUrl = useCallback(
    (id: string, url: string) => {
      void submitOps([{ kind: 'setUrl', id, url }]);
    },
    [submitOps],
  );

  const handleRenameFolder = useCallback(
    (id: string, title: string) => {
      void submitOps([{ kind: 'rename', id, title }]);
    },
    [submitOps],
  );

  /**
   * 新建后直接进入重命名：先用占位名落盘，再从回执的文件夹表里找出多出来的那个节点。
   * 新文件夹的 id 只有扩展知道，页面唯一可信的来源就是回执。
   *
   * 落点要按 id 链还原成「一级 + 二级」的导航状态：直接把 activeFolder 设成二级 id，
   * 会被「activeFolder 必须命中一级列表」的效应打回全部书签。
   */
  const handleCreateFolder = useCallback(
    async (parentId: string) => {
      const before = new Set(folderNodes.map((node) => node.id));
      const result = await submitOps([{ kind: 'createFolder', title: '新建文件夹', parentId }]);
      if (!result) return;

      const created = result.folders.find((node) => !before.has(node.id));
      if (!created) return;

      const index = createFolderIndex(result.folders);
      const chain = index.chainOf(created.id);
      setActiveFolder(chain[0] ?? ALL_FOLDERS);
      setActiveSubfolder(chain[1] ?? ALL_FOLDERS);
      setRenamingFolderId(created.id);
    },
    [folderNodes, submitOps],
  );

  const moveBookmarks = useCallback(
    async (ids: string[], folderId: string) => {
      if (ids.length === 0) return;
      await submitOps(ids.map((id) => ({ kind: 'move' as const, id, intoFolderId: folderId })));
      setPendingFocusId(ids[0] ?? null);
    },
    [submitOps],
  );

  /**
   * 移动后把焦点接回那张卡片的新位置。
   *
   * 卡片会随分组重挂，Radix 想归还焦点时原来的触发器已经不在 DOM 里，焦点就掉到 body，
   * 键盘用户每移一次都得重新 Tab 一遍。等书签落地后再找一次，找不到就算了——
   * 移进当前视图看不见的文件夹时，本来也没有可去的地方。
   */
  useEffect(() => {
    if (!pendingFocusId) return;
    const trigger = [...document.querySelectorAll('[data-card-menu-trigger]')].find(
      (element) => element.getAttribute('data-card-menu-trigger') === pendingFocusId,
    );
    setPendingFocusId(null);
    if (trigger instanceof HTMLElement) trigger.focus();
  }, [bookmarks, pendingFocusId]);

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // 只提交仍然存在于收藏夹里的选择：删除后 id 就没了，不能拿旧 id 去调写入
  const selectedIds = useMemo(
    () => bookmarks.filter((bookmark) => selected.has(bookmark.id)).map((bookmark) => bookmark.id),
    [bookmarks, selected],
  );

  const runDelete = useCallback(async () => {
    const ids = selectedIds;
    setSelected(new Set());
    await submitOps(ids.map((id) => ({ kind: 'remove' as const, id })));
  }, [selectedIds, submitOps]);

  // 退出编辑态就把选择、报错、待确认弹窗、文件夹改名和拖拽高亮一起收掉
  useEffect(() => {
    if (editMode) return;
    setSelected(new Set());
    setEditError(null);
    setConfirmingDelete(false);
    setRenamingFolderId(null);
    setDragOver(null);
  }, [editMode]);

  const renderCard = (bookmark: Bookmark) => (
    <BookmarkCard
      key={bookmark.id}
      bookmark={bookmark}
      health={health[bookmark.url]}
      onOpen={handleOpenBookmark}
      editMode={editMode}
      selected={selected.has(bookmark.id)}
      onToggleSelect={toggleSelect}
      onRename={handleRename}
      onSetUrl={handleSetUrl}
      onInvalid={setEditError}
      dragIds={selected.has(bookmark.id) ? selectedIds : [bookmark.id]}
      moveTargets={folderActions ? moveTargets : undefined}
      onMoveTo={(id, folderId) => void moveBookmarks([id], folderId)}
      onDelete={(id) => {
        setSelected(new Set([id]));
        setConfirmingDelete(true);
      }}
      onDragEnd={() => setDragOver(null)}
    />
  );

  const clearFilters = () => {
    setQuery('');
    setActiveFolder(ALL_FOLDERS);
    setActiveSubfolder(ALL_FOLDERS);
    setAttentionOnly(false);
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

  /**
   * 编辑态不可用的原因，null 表示可以编辑。
   * 文件夹节点表是所有编辑操作的身份来源，旧版插件不下发它，此时页面只能读。
   */
  const editHint = fromFile
    ? '导入的书签文件是只读的，编辑针对浏览器收藏夹本身'
    : status !== 'connected'
      ? '连上书签插件后才能编辑收藏夹'
      : folderNodes.length === 0 && total > 0
        ? '插件版本过旧，升级后才能编辑收藏夹'
        : null;

  // 从可编辑掉到不可编辑（切去读文件、插件断开）时退出编辑态，别把界面停在半编辑
  useEffect(() => {
    if (editHint) setEditMode(false);
  }, [editHint]);

  /**
   * 侧栏只有在编辑态、且确实拿到了文件夹节点表时才交出写操作。
   * 不传 actions 就等于只读，侧栏自己不必再判断一遍页面状态。
   */
  const folderActions: FolderActions | undefined =
    editMode && editHint === null
      ? {
          rename: handleRenameFolder,
          createRoot: () => {
            const container = folderIndex.defaultContainerId;
            if (container) void handleCreateFolder(container);
          },
          createSubfolder: (parentId) => void handleCreateFolder(parentId),
          invalid: setEditError,
          renamingId: renamingFolderId,
          startRename: setRenamingFolderId,
          endRename: () => setRenamingFolderId(null),
        }
      : undefined;

  // 只有一个二级文件夹时 chip 行纯属噪音；但编辑态下必须显示，否则刚建的那一个无处改名
  const showSubfolders =
    activeFolder !== ALL_FOLDERS && subfolders.length > (folderActions ? 0 : 1);

  const moveTargets = useMemo(
    () => buildMoveTargets(folderNodes, folderIndex),
    [folderNodes, folderIndex],
  );

  /** 落点 id：「未分组」不是节点，要换成默认容器，否则挪不出文件夹 */
  const dropIdOf = (key: string) =>
    key === UNGROUPED_KEY ? folderIndex.defaultContainerId : key;

  const drag: DragState | undefined = folderActions
    ? {
        over: dragOver,
        setOver: setDragOver,
        onDrop: (ids, folderId) => void moveBookmarks(ids, folderId),
      }
    : undefined;

  return (
    <div className="flex min-h-dvh flex-col lg:h-dvh lg:overflow-hidden">
      <TopNav
        query={query}
        onQueryChange={setQuery}
        filterRef={desktopFilterRef}
        onImport={openFilePicker}
        onRefresh={loadFromExtension}
        checking={checking}
        newTabState={newTabState}
        attentionCount={status === 'connected' && !fromFile ? attentionCount : 0}
        attentionOnly={attentionOnly}
        onToggleAttention={() => setAttentionOnly((value) => !value)}
        editMode={editMode}
        editHint={editHint}
        onToggleEdit={() => setEditMode((value) => !value)}
      />

      {editMode && <EditModeBanner onExit={() => setEditMode(false)} />}

      <div className="relative mx-auto flex w-full max-w-[1200px] flex-1 flex-col px-5 sm:px-8 lg:min-h-0 lg:flex-row lg:gap-10 lg:overflow-hidden">
        {total > 0 && (
          <BookmarksSidebar
            folders={folders}
            total={total}
            activeFolder={activeFolder}
            onSelectFolder={selectFolder}
            allKey={ALL_FOLDERS}
            actions={folderActions}
            drag={drag}
            ungroupedId={folderIndex.defaultContainerId}
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
                  {normalizedQuery || activeFolder !== ALL_FOLDERS || attentionOnly
                    ? `${visible.length} / ${total} 个`
                    : `${total} 个`}
                </span>
              </div>
            </div>

            {total > 0 && showSubfolders && (
              <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="二级文件夹">
                <SubfolderChip
                  label="全部"
                  hint={`${activeFolderLabel} 全部`}
                  count={folderScoped.length}
                  active={activeSubfolder === ALL_FOLDERS}
                  onSelect={() => setActiveSubfolder(ALL_FOLDERS)}
                />
                {subfolders.map((subfolder) => (
                  <SubfolderChip
                    key={subfolder.key}
                    label={subfolder.label}
                    hint={subfolder.hint}
                    count={subfolder.count}
                    active={activeSubfolder === subfolder.key}
                    onSelect={() => setActiveSubfolder(subfolder.key)}
                    actions={folderActions}
                    folderKey={subfolder.key}
                    drag={drag}
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

            {editError && (
              <div
                role="alert"
                className="mt-5 flex items-center gap-2.5 rounded-xl border border-destructive/30 bg-destructive/8 px-4 py-3 text-[13px] leading-relaxed text-destructive"
              >
                <TriangleAlert className="size-4 shrink-0" />
                <p className="min-w-0 flex-1">{editError}</p>
                <button
                  type="button"
                  onClick={() => setEditError(null)}
                  className="shrink-0 rounded-md border border-destructive/30 px-2 py-0.5 text-[12px] font-medium transition-colors hover:bg-destructive/10 focus-visible:ring-[3px] focus-visible:ring-destructive/30 focus-visible:outline-none"
                >
                  知道了
                </button>
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
                {normalizedQuery ? (
                  <EmptyState
                    icon={SearchX}
                    title="没有匹配的书签"
                    description="换个关键词，或清除筛选看看全部书签。"
                  >
                    <Button size="sm" variant="outline" onClick={clearFilters}>
                      清除筛选
                    </Button>
                  </EmptyState>
                ) : attentionOnly ? (
                  <EmptyState
                    icon={ShieldCheck}
                    title="这里没有需要关注的链接"
                    description="其余书签要么可访问，要么还没测过。"
                  >
                    <Button size="sm" variant="outline" onClick={clearFilters}>
                      清除筛选
                    </Button>
                  </EmptyState>
                ) : (
                  <EmptyState
                    icon={Folder}
                    title="这个文件夹还是空的"
                    description="把网页收藏到这个文件夹里，回到这里就能看到。"
                  />
                )}
              </div>
            )}

            {visible.length > 0 && showGroups && (
              <div className="mt-5 space-y-8">
                {groups.map((group) => {
                  const targetId = dropIdOf(group.key);
                  return (
                  <section key={group.key} aria-label={group.label}>
                    <div
                      className={cn(
                        'flex items-baseline gap-2 rounded-md',
                        drag?.over === targetId && 'bg-primary/10 ring-2 ring-primary/40',
                      )}
                      {...(drag && targetId ? dropProps(targetId, drag) : {})}
                    >
                      <h3 className="flex items-center gap-1.5 text-[13px] font-medium">
                        <Folder className="size-3.5 text-muted-foreground" />
                        {group.label}
                      </h3>
                      <span className="text-[11px] tabular-nums text-muted-foreground">
                        {group.bookmarks.length}
                      </span>
                    </div>
                    <div className={cn('mt-3', TILE_GRID)}>
                      {group.bookmarks.map(renderCard)}
                    </div>
                  </section>
                  );
                })}
              </div>
            )}

            {visible.length > 0 && !showGroups && (
              <div className={cn('mt-5', TILE_GRID)}>
                {visible.map(renderCard)}
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

      {editMode && (
        <EditActionBar
          count={selectedIds.length}
          busy={mutating}
          onClear={() => setSelected(new Set())}
          onDelete={() => setConfirmingDelete(true)}
        />
      )}

      <AlertDialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              从浏览器收藏夹删除 {selectedIds.length} 项？
            </AlertDialogTitle>
            <AlertDialogDescription>
              这些条目会从浏览器的书签里移除，并随浏览器账号同步到其他设备。
              Qianxu 不保存书签副本，删掉之后无法在这里撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Button variant="outline" size="sm">
                取消
              </Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button variant="destructive" size="sm" onClick={() => void runDelete()}>
                删除 {selectedIds.length} 项
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
  hint,
  count,
  active,
  onSelect,
  actions,
  folderKey,
  drag,
}: {
  label: string;
  hint: string;
  count: number;
  active: boolean;
  onSelect: () => void;
  /** 只有重命名：页面只导航两级，三级文件夹建出来也看不见、点不到 */
  actions?: FolderActions;
  folderKey?: string;
  drag?: DragState;
}) {
  const renaming = Boolean(actions && folderKey && actions.renamingId === folderKey);
  const highlighted = Boolean(folderKey && drag?.over === folderKey);

  if (renaming && actions && folderKey) {
    return (
      <div className="flex h-7 items-center rounded-full border bg-background px-2">
        <InlineField
          label="文件夹名称"
          hint=""
          value={label}
          startEditing
          className="text-[12px]"
          onCommit={(next) => {
            actions.endRename();
            actions.rename(folderKey, next);
          }}
          onCancel={actions.endRename}
          onInvalid={actions.invalid}
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex h-7 max-w-[220px] items-center rounded-full border text-[12px] transition-colors',
        active
          ? 'border-transparent bg-accent font-medium text-foreground'
          : 'bg-card text-muted-foreground',
        highlighted && 'ring-2 ring-primary/50',
      )}
      {...(folderKey && drag ? dropProps(folderKey, drag) : {})}
    >
      <button
        type="button"
        aria-pressed={active}
        onClick={onSelect}
        title={hint}
        className={cn(
          'flex min-w-0 items-center gap-1.5 rounded-full py-1 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30',
          actions && folderKey ? 'pl-2.5' : 'px-2.5',
        )}
      >
        <span className="truncate">{label}</span>
        <span className="shrink-0 text-[11px] tabular-nums opacity-70">{count}</span>
      </button>

      {actions && folderKey && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`「${label}」子文件夹操作`}
              className="flex h-7 w-6 shrink-0 items-center justify-center rounded-full outline-none transition-colors hover:bg-accent/70 focus-visible:ring-[3px] focus-visible:ring-ring/30 data-[state=open]:bg-accent/70"
            >
              <MoreHorizontal className="size-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => actions.startRename(folderKey)}>
              <PencilLine />
              重命名
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
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
