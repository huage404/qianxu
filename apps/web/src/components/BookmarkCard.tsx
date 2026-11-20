import { useState, type CSSProperties } from 'react';
import type { Bookmark } from '@qianxu/shared';

const MONOGRAM_HUES = [262, 292, 338, 22, 152, 198, 276, 68];

function hueFor(seed: string): number {
  let hash = 5381;
  for (let index = 0; index < seed.length; index++) {
    hash = ((hash << 5) + hash + seed.charCodeAt(index)) | 0;
  }
  return MONOGRAM_HUES[Math.abs(hash) % MONOGRAM_HUES.length];
}

export function BookmarkCard({
  bookmark,
  onOpen,
}: {
  bookmark: Bookmark;
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
  const tooltip = [folderLabel, bookmark.url].filter(Boolean).join('\n');
  const style = { '--mono': String(hueFor(host)) } as CSSProperties;

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
        className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted transition-transform duration-200 group-hover:scale-105"
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
      </span>

      <span className="flex w-full min-w-0 flex-col gap-0.5">
        <span className="truncate text-sm font-medium">{title}</span>
        <span className="truncate text-[11px] leading-4 text-muted-foreground">{host}</span>
      </span>
    </a>
  );
}
