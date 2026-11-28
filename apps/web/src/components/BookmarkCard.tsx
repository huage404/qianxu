import { useState, type CSSProperties } from 'react';
import type { Bookmark, LinkHealthRecord } from '@qianxu/shared';

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

export function BookmarkCard({
  bookmark,
  health,
  onOpen,
}: {
  bookmark: Bookmark;
  health?: LinkHealthRecord;
  onOpen?: (bookmark: Bookmark) => void;
}) {
  const [iconFailed, setIconFailed] = useState(false);

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
  const tooltip = [folderLabel, bookmark.url, note].filter(Boolean).join('\n');
  const style = { '--mono': String(hueFor(host)) } as CSSProperties;
  // unknown 什么都不标：本机断网时整批都会落到这个状态，标出来等于刷屏
  const dot =
    health?.status === 'dead'
      ? 'bg-destructive'
      : health?.status === 'suspect'
        ? 'bg-amber-500'
        : null;

  return (
    <a
      href={bookmark.url}
      target="_blank"
      rel="noopener noreferrer"
      style={style}
      title={tooltip}
      onClick={() => onOpen?.(bookmark)}
      onAuxClick={(event) => {
        if (event.button === 1) onOpen?.(bookmark);
      }}
      className="group flex min-w-0 flex-col items-center gap-3 rounded-2xl border bg-card px-4 py-5 text-center shadow-xs transition-[border-color,background-color,box-shadow] duration-200 outline-none hover:border-ring/40 hover:bg-accent/30 hover:shadow-sm focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30"
    >
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

      <span className="flex w-full min-w-0 flex-col gap-0.5">
        <span className="truncate text-sm font-medium">{title}</span>
        <span className="truncate text-[11px] leading-4 text-muted-foreground">{host}</span>
      </span>

      {note && <span className="sr-only">{note}</span>}
    </a>
  );
}
