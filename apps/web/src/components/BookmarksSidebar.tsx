import { Folder, Layers } from 'lucide-react';

import { cn } from '@/lib/utils';

export interface FolderStat {
  key: string;
  label: string;
  count: number;
}

interface BookmarksSidebarProps {
  folders: FolderStat[];
  total: number;
  activeFolder: string;
  onSelectFolder: (key: string) => void;
  allKey: string;
}

export function BookmarksSidebar({
  folders,
  total,
  activeFolder,
  onSelectFolder,
  allKey,
}: BookmarksSidebarProps) {
  return (
    <aside className="hidden lg:block lg:h-full lg:w-[220px] lg:shrink-0 lg:overflow-y-auto lg:pt-10 lg:pb-6">
      <p className="px-2.5 text-[11px] font-medium text-muted-foreground">文件夹</p>
      <nav aria-label="书签文件夹" className="mt-2 space-y-0.5">
        <FolderItem
          icon={Layers}
          label="全部"
          count={total}
          active={activeFolder === allKey}
          onClick={() => onSelectFolder(allKey)}
        />
        {folders.map((folder) => (
          <FolderItem
            key={folder.key}
            icon={Folder}
            label={folder.label}
            count={folder.count}
            active={activeFolder === folder.key}
            onClick={() => onSelectFolder(folder.key)}
          />
        ))}
      </nav>
    </aside>
  );
}

function FolderItem({
  icon: Icon,
  label,
  count,
  active,
  onClick,
}: {
  icon: typeof Folder;
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'true' : undefined}
      title={label}
      className={cn(
        'flex h-9 w-full items-center gap-2 rounded-lg px-2.5 text-left text-[13px] transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30',
        active
          ? 'bg-accent font-medium text-foreground'
          : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
      )}
    >
      <Icon className="size-3.5 shrink-0 opacity-80" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{count}</span>
    </button>
  );
}
