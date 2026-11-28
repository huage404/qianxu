import { Folder, FolderPlus, Layers, MoreHorizontal, PencilLine } from 'lucide-react';

import { InlineField } from '@/components/InlineField';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { dropProps, type DragState } from '@/lib/drag';
import { UNGROUPED_KEY, type FolderStat } from '@/lib/folders';
import { cn } from '@/lib/utils';

/** 省略即侧栏只读；传进来就代表当前处于编辑态 */
export interface FolderActions {
  rename: (id: string, title: string) => void;
  createRoot: () => void;
  createSubfolder: (parentId: string) => void;
  invalid: (message: string) => void;
  renamingId: string | null;
  startRename: (id: string) => void;
  endRename: () => void;
}

interface BookmarksSidebarProps {
  folders: FolderStat[];
  total: number;
  activeFolder: string;
  onSelectFolder: (key: string) => void;
  allKey: string;
  actions?: FolderActions;
  /** 拖拽落点；省略即不接受拖放 */
  drag?: DragState;
  /** 「未分组」不是一个文件夹节点，它对应默认容器，移动到这里等于把书签挪出文件夹 */
  ungroupedId?: string;
}

export function BookmarksSidebar({
  folders,
  total,
  activeFolder,
  onSelectFolder,
  allKey,
  actions,
  drag,
  ungroupedId,
}: BookmarksSidebarProps) {
  return (
    <aside className="hidden lg:flex lg:h-full lg:w-[220px] lg:shrink-0 lg:flex-col lg:overflow-y-auto lg:pt-10 lg:pb-6">
      <p className="px-2.5 text-[11px] font-medium text-muted-foreground">文件夹</p>
      <nav aria-label="书签文件夹" className="mt-2 space-y-0.5">
        <FolderItem
          icon={Layers}
          label="全部"
          hint="全部书签"
          count={total}
          active={activeFolder === allKey}
          onClick={() => onSelectFolder(allKey)}
        />
        {folders.map((folder) => (
          <FolderItem
            key={folder.key}
            icon={Folder}
            label={folder.label}
            hint={folder.hint}
            count={folder.count}
            active={activeFolder === folder.key}
            onClick={() => onSelectFolder(folder.key)}
            actions={actions}
            folderKey={folder.key}
            drag={drag}
            ungroupedId={ungroupedId}
          />
        ))}
      </nav>

      {actions && (
        <Button
          variant="outline"
          size="sm"
          className="mt-3 w-full justify-start gap-2 px-2.5"
          onClick={actions.createRoot}
        >
          <FolderPlus className="size-3.5" />
          新建文件夹
        </Button>
      )}
    </aside>
  );
}

function FolderItem({
  icon: Icon,
  label,
  hint,
  count,
  active,
  onClick,
  actions,
  folderKey,
  drag,
  ungroupedId,
}: {
  icon: typeof Folder;
  label: string;
  hint: string;
  count: number;
  active: boolean;
  onClick: () => void;
  actions?: FolderActions;
  folderKey?: string;
  drag?: DragState;
  ungroupedId?: string;
}) {
  // 「未分组」是个虚拟分组，不是书签树里的节点，没有 id 可以改
  const editable = Boolean(actions && folderKey && folderKey !== UNGROUPED_KEY);
  const renaming = Boolean(editable && actions && folderKey && actions.renamingId === folderKey);

  // 「全部书签」行没有 folderKey，因此天然不是落点；「未分组」行落到默认容器上，
  // 否则就只能往文件夹里挪、挪不出来
  const dropId = folderKey
    ? folderKey === UNGROUPED_KEY
      ? ungroupedId
      : folderKey
    : undefined;
  const highlighted = Boolean(dropId && drag?.over === dropId);

  if (renaming && actions && folderKey) {
    return (
      <div className="flex h-9 items-center rounded-lg border bg-background px-1">
        <InlineField
          label="文件夹名称"
          hint=""
          value={label}
          startEditing
          className="text-[13px]"
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
        'flex items-center gap-0.5 rounded-lg',
        highlighted && 'bg-primary/10 ring-2 ring-primary/40',
      )}
      {...(dropId && drag ? dropProps(dropId, drag) : {})}
    >
      <button
        type="button"
        onClick={onClick}
        aria-current={active ? 'true' : undefined}
        title={hint}
        className={cn(
          'flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg px-2.5 text-left text-[13px] transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30',
          active
            ? 'bg-accent font-medium text-foreground'
            : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
        )}
      >
        <Icon className="size-3.5 shrink-0 opacity-80" />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{count}</span>
      </button>

      {editable && actions && folderKey && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`${label} 的文件夹操作`}
              className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-70 outline-none transition-opacity hover:bg-accent hover:text-foreground hover:opacity-100 focus-visible:ring-[3px] focus-visible:ring-ring/30 data-[state=open]:opacity-100"
            >
              <MoreHorizontal className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => actions.startRename(folderKey)}>
              <PencilLine />
              重命名
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => actions.createSubfolder(folderKey)}>
              <FolderPlus />
              新建子文件夹
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
