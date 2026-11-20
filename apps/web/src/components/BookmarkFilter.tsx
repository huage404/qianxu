import type { RefObject } from 'react';
import { ListFilter, X } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface BookmarkFilterProps {
  value: string;
  onChange: (value: string) => void;
  inputRef?: RefObject<HTMLInputElement | null>;
  className?: string;
}

export function BookmarkFilter({ value, onChange, inputRef, className }: BookmarkFilterProps) {
  return (
    <div className={cn('relative', className)}>
      <ListFilter className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        ref={inputRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            onChange('');
            event.currentTarget.blur();
          }
        }}
        placeholder="筛选书签"
        aria-label="筛选书签"
        autoComplete="off"
        spellCheck={false}
        className="h-9 rounded-lg border-transparent bg-muted/50 pr-8 pl-8 text-[13px] shadow-none focus-visible:bg-card sm:pr-12"
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="清除筛选"
          className="absolute top-1/2 right-1 grid size-6 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/30 focus-visible:outline-none"
        >
          <X className="size-3.5" />
        </button>
      ) : (
        <kbd className="pointer-events-none absolute top-1/2 right-2 hidden -translate-y-1/2 rounded border bg-muted px-1.5 py-0.5 font-sans text-[10px] leading-4 font-medium text-muted-foreground sm:block">
          ⌘K
        </kbd>
      )}
    </div>
  );
}
