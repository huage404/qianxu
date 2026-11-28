import { useState, type CSSProperties } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { type Bookmark, type LinkHealthRecord } from '@qianxu/shared';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { InlineField, requireHttpUrl } from '@/components/InlineField';
import { DRAG_MIME } from '@/lib/drag';
import type { MoveTarget } from '@/lib/folders';
import { cn } from '@/lib/utils';

const MONOGRAM_HUES = [262, 292, 338, 22, 152, 198, 276, 68];
const DAY_MS = 24 * 60 * 60 * 1000;

function hueFor(seed: string): number {
  let hash = 5381;
  for (let index = 0; index < seed.length; index++) {
    hash = ((hash << 5) + hash + seed.charCodeAt(index)) | 0;
  }
  return MONOGRAM_HUES[Math.abs(hash) % MONOGRAM_HUES.length];
}

/**
 * 健康度提示文案。措辞刻意用「可访问」而不是「正常」：
 * 探测只看得到 HTTP 状态码，看不出来内容还是不是你要的那篇。
 */
function healthNote(record: LinkHealthRecord | undefined): string | null {
  if (!record) return null;
  const checked = record.checkedAt ? ` · ${checkedAgo(record.checkedAt)}检测` : '';

  if (record.status === 'dead') {
    const detail = record.httpStatus
      ? `响应 ${record.httpStatus}`
      : record.reason === 'timeout'
        ? '连接超时'
        : '域名或连接无法解析';
    return `多次检测无法访问（${detail}）${checked}`;
  }
  if (record.status === 'suspect') {
    return record.httpStatus
      ? `站点拒绝程序化访问（响应 ${record.httpStatus}），无法确认可访问性${checked}`
      : `检测超时，无法确认可访问性${checked}`;
  }
  if (record.status === 'ok') return `可访问${checked}`;
  return null;
}

function checkedAgo(checkedAt: number, now = Date.now()): string {
  const days = Math.floor((now - checkedAt) / DAY_MS);
  if (days <= 0) return '今天';
  if (days === 1) return '昨天';
  return `${days} 天前`;
}

interface BookmarkCardProps {
  bookmark: Bookmark;
  health?: LinkHealthRecord;
  onOpen?: (bookmark: Bookmark) => void;
  editMode?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
  onRename?: (id: string, title: string) => void;
  onSetUrl?: (id: string, url: string) => void;
  /** 本地校验没过时不提交，把原因交给页面统一提示 */
  onInvalid?: (message: string) => void;
  /** 拖动这张卡片要带走的全部 id：选中时是整组，否则只有自己 */
  dragIds?: string[];
  /** 省略即不提供「移动到」，卡片也不再挂拖拽 */
  moveTargets?: MoveTarget[];
  onMoveTo?: (id: string, folderId: string) => void;
  onDragEnd?: () => void;
}

export function BookmarkCard({
  bookmark,
  health,
  onOpen,
  editMode = false,
  selected = false,
  onToggleSelect,
  onRename,
  onSetUrl,
  onInvalid = () => {},
  dragIds,
  moveTargets,
  onMoveTo,
  onDragEnd,
}: BookmarkCardProps) {
  const [iconFailed, setIconFailed] = useState(false);
  const [dragging, setDragging] = useState(false);

  let host = bookmark.url;
  try {
    host = new URL(bookmark.url).hostname.replace(/^www\./, '');
  } catch {
    // keep raw url as label
  }

  const title = bookmark.title || host;
  const folderLabel = bookmark.folderPath?.length
    ? bookmark.folderPath.join(' / ')
    : bookmark.folder;
  const note = healthNote(health);
  const style = { '--mono': String(hueFor(host)) } as CSSProperties;
  // unknown 什么都不标：本机断网时整批都会落到这个状态，标出来等于刷屏
  const dot =
    health?.status === 'dead'
      ? 'bg-destructive'
      : health?.status === 'suspect'
        ? 'bg-amber-500'
        : null;

  const icon = (
    <span
      aria-hidden="true"
      className="relative grid size-10 shrink-0 place-items-center rounded-xl bg-muted transition-transform duration-200 group-hover:scale-105"
    >
      {bookmark.faviconUrl && !iconFailed ? (
        <img
          src={bookmark.faviconUrl}
          alt=""
          width={20}
          height={20}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          className="size-5 rounded-[4px] object-contain"
          onError={() => setIconFailed(true)}
        />
      ) : (
        <span className="grid size-full place-items-center rounded-xl bg-[oklch(0.55_0.16_var(--mono)/0.14)] text-[15px] font-semibold text-[oklch(0.45_0.16_var(--mono))] dark:bg-[oklch(0.7_0.16_var(--mono)/0.16)] dark:text-[oklch(0.8_0.12_var(--mono))]">
          {title.trim().charAt(0).toUpperCase() || '?'}
        </span>
      )}

      {dot && (
        <span
          className={`absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full ring-2 ring-card ${dot}`}
        />
      )}
    </span>
  );

  const shell =
    'group relative flex min-w-0 flex-col items-center gap-3 rounded-2xl border bg-card px-4 py-5 text-center shadow-xs transition-[border-color,background-color,box-shadow] duration-200 outline-none';

  // 编辑态刻意不用 <a>：链接卡片要挡住的是全部跳转路径，
  // 只 preventDefault 掉 onClick 会漏掉中键和回车，点标题改名却把页面跳走是最糟的观感。
  if (editMode) {
    // 已经在当前文件夹里的目标不必出现在「移动到」里
    const targets = (moveTargets ?? []).filter((target) => target.id !== bookmark.folderId);

    return (
      <div
        style={style}
        draggable={targets.length > 0}
        onDragStart={(event) => {
          if (targets.length === 0) return;
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData(DRAG_MIME, JSON.stringify(dragIds ?? [bookmark.id]));
          setDragging(true);
        }}
        onDragEnd={() => {
          setDragging(false);
          onDragEnd?.();
        }}
        className={cn(
          shell,
          'focus-visible:ring-[3px] focus-visible:ring-ring/30',
          selected ? 'border-primary/60 bg-accent/40' : 'hover:border-ring/40',
          dragging && 'opacity-50',
        )}
      >
        <label className="absolute top-2 left-2 flex cursor-pointer items-center gap-1">
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelect?.(bookmark.id)}
            className="size-4 accent-primary"
          />
          <span className="sr-only">选择「{title}」</span>
        </label>

        {targets.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                data-card-menu={bookmark.id}
                aria-label={`把「${title}」移动到`}
                className="absolute top-1.5 right-1.5 flex size-6 items-center justify-center rounded-md text-muted-foreground opacity-70 outline-none transition-opacity hover:bg-accent hover:text-foreground hover:opacity-100 focus-visible:ring-[3px] focus-visible:ring-ring/30 data-[state=open]:opacity-100"
              >
                <MoreHorizontal className="size-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-[60vh] overflow-y-auto">
              {targets.map((target) => (
                <DropdownMenuItem
                  key={target.id}
                  style={{ paddingLeft: `${8 + target.depth * 14}px` }}
                  onSelect={() => onMoveTo?.(bookmark.id, target.id)}
                >
                  {target.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {icon}

        <span className="flex w-full min-w-0 flex-col gap-0.5">
          <InlineField
            label="书签标题"
            hint="点击重命名"
            value={bookmark.title}
            className="text-sm font-medium"
            onCommit={(next) => onRename?.(bookmark.id, next)}
            onInvalid={onInvalid}
          />
          <InlineField
            label="书签链接"
            hint="点击修改链接"
            value={bookmark.url}
            className="text-[11px] leading-4 text-muted-foreground"
            validate={requireHttpUrl}
            onCommit={(next) => onSetUrl?.(bookmark.id, next)}
            onInvalid={onInvalid}
          />
        </span>

        {note && <span className="sr-only">{note}</span>}
      </div>
    );
  }

  return (
    <a
      href={bookmark.url}
      target="_blank"
      rel="noopener noreferrer"
      style={style}
      title={[folderLabel, bookmark.url, note].filter(Boolean).join('\n')}
      onClick={() => onOpen?.(bookmark)}
      onAuxClick={(event) => {
        if (event.button === 1) onOpen?.(bookmark);
      }}
      className={cn(
        shell,
        'hover:bg-accent/30 hover:shadow-sm focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30',
      )}
    >
      {icon}

      <span className="flex w-full min-w-0 flex-col gap-0.5">
        <span className="truncate text-sm font-medium">{title}</span>
        <span className="truncate text-[11px] leading-4 text-muted-foreground">{host}</span>
      </span>

      {note && <span className="sr-only">{note}</span>}
    </a>
  );
}
