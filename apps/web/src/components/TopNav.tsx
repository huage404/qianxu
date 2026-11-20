import type { RefObject } from 'react';
import { Layers, RotateCw, Upload } from 'lucide-react';

import { BookmarkFilter } from '@/components/BookmarkFilter';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface TopNavProps {
  query: string;
  onQueryChange: (value: string) => void;
  filterRef: RefObject<HTMLInputElement | null>;
  onImport: () => void;
  onRefresh: () => void;
  checking: boolean;
}

export function TopNav({
  query,
  onQueryChange,
  filterRef,
  onImport,
  onRefresh,
  checking,
}: TopNavProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background">
      <div className="mx-auto flex h-16 w-full max-w-[1200px] items-center gap-3 px-5 sm:px-8">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="grid size-8 shrink-0 place-items-center rounded-[9px] bg-primary text-primary-foreground shadow-sm">
            <Layers className="size-4" strokeWidth={2.2} />
          </div>
          <div className="min-w-0">
            <h1 className="text-sm leading-tight font-semibold tracking-tight">Qianxu</h1>
            <p className="hidden text-[11px] leading-tight text-muted-foreground sm:block">
              搜索与书签起始页
            </p>
          </div>
        </div>

        <div className="ml-auto hidden w-full max-w-sm lg:block">
          <BookmarkFilter value={query} onChange={onQueryChange} inputRef={filterRef} />
        </div>

        <div className="ml-auto flex items-center gap-1 lg:ml-3">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground"
            onClick={onImport}
          >
            <Upload className="size-3.5" />
            <span className="hidden sm:inline">导入 JSON</span>
            <span className="sm:hidden">导入</span>
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground hover:text-foreground"
            onClick={onRefresh}
            disabled={checking}
            aria-label="刷新书签"
            title="刷新书签"
          >
            <RotateCw className={cn('size-4', checking && 'animate-spin')} />
          </Button>
          <span aria-hidden className="mx-1 hidden h-5 w-px bg-border sm:block" />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
