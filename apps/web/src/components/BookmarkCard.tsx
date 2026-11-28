import { useRef, useState, type CSSProperties } from 'react';
import { type Bookmark, type LinkHealthRecord } from '@qianxu/shared';

import { BookmarkActions, SelectedBadge, type MenuAnchorPoint } from '@/components/BookmarkActions';
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

type EditingField = 'title' | 'url' | null;

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
  /** 省略即不提供动作菜单，卡片也不再挂拖拽 */
  moveTargets?: MoveTarget[];
  onMoveTo?: (id: string, folderId: string) => void;
  onDelete?: (id: string) => void;
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
  onDelete,
  onDragEnd,
}: BookmarkCardProps) {
  const [iconFailed, setIconFailed] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [editing, setEditing] = useState<EditingField>(null);
  const [anchor, setAnchor] = useState<MenuAnchorPoint | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

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

  // 已经在当前文件夹里的目标不必出现在「移动到」里
  const targets = (moveTargets ?? []).filter((target) => target.id !== bookmark.folderId);

  /**
   * 由菜单在交还焦点的那一刻调用，把编辑焦点交给行内输入框。
   * 顺带全选，让用户直接覆盖着打。
   */
  const focusEditor = () => {
    const input = rootRef.current?.querySelector('input');
    if (input instanceof HTMLInputElement) {
      input.focus();
      input.select();
    }
  };

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
    const toggle = () => onToggleSelect?.(bookmark.id);

    return (
      <div
        ref={rootRef}
        role="button"
        tabIndex={0}
        aria-pressed={selected}
        aria-label={title}
        title={[folderLabel, bookmark.url, note].filter(Boolean).join('\n')}
        style={style}
        draggable={targets.length > 0 && editing === null}
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
        onClick={() => {
          if (editing === null) toggle();
        }}
        onKeyDown={(event) => {
          if (editing !== null) return;
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            toggle();
          }
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          setAnchor({ x: event.clientX, y: event.clientY, align: 'start' });
        }}
        className={cn(
          shell,
          'cursor-pointer focus-visible:ring-[3px] focus-visible:ring-ring/30',
          selected
            ? 'border-primary bg-primary/8 ring-2 ring-primary/35'
            : 'hover:border-ring/40 hover:bg-accent/20',
          dragging && 'opacity-50',
        )}
      >
        {selected && <SelectedBadge />}

        {targets.length > 0 && (
          <BookmarkActions
            subjectId={bookmark.id}
            subject={title}
            anchor={anchor}
            targets={targets}
            onOpen={setAnchor}
            onClose={() => setAnchor(null)}
            onHandoff={focusEditor}
            onRename={() => setEditing('title')}
            onEditUrl={() => setEditing('url')}
            onMoveTo={(folderId) => onMoveTo?.(bookmark.id, folderId)}
            onDelete={() => onDelete?.(bookmark.id)}
          />
        )}

        {icon}

        <span
          className="flex w-full min-w-0 flex-col gap-0.5"
          onClick={(event) => {
            if (editing !== null) event.stopPropagation();
          }}
        >
          {editing === 'title' ? (
            <InlineField
              label="书签标题"
              hint=""
              value={bookmark.title}
              startEditing
              className="text-sm font-medium"
              onCommit={(next) => {
                setEditing(null);
                onRename?.(bookmark.id, next);
              }}
              onCancel={() => setEditing(null)}
              onInvalid={onInvalid}
            />
          ) : (
            <span className="truncate text-sm font-medium">{title}</span>
          )}

          {editing === 'url' ? (
            <InlineField
              label="书签链接"
              hint=""
              value={bookmark.url}
              startEditing
              validate={requireHttpUrl}
              className="text-[11px] leading-4 text-muted-foreground"
              onCommit={(next) => {
                setEditing(null);
                onSetUrl?.(bookmark.id, next);
              }}
              onCancel={() => setEditing(null)}
              onInvalid={onInvalid}
            />
          ) : (
            <span className="truncate text-[11px] leading-4 text-muted-foreground">{host}</span>
          )}
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
