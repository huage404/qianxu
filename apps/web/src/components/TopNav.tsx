import type { RefObject } from 'react';
import { Download, RotateCw, Upload } from 'lucide-react';

import { BookmarkFilter } from '@/components/BookmarkFilter';
import { LogoMark } from '@/components/LogoMark';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import { EXTENSION_DOWNLOAD_URL } from '@/lib/constants';
import { cn } from '@/lib/utils';

const REPO_URL = 'https://github.com/huage404/qianxu';

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
          <LogoMark size={32} className="shadow-sm" />
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
            asChild
          >
            <a href={EXTENSION_DOWNLOAD_URL} rel="noreferrer">
              <Download className="size-3.5" />
              <span className="hidden sm:inline">下载插件</span>
              <span className="sm:hidden">插件</span>
            </a>
          </Button>
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
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground hover:text-foreground"
            asChild
          >
            <a
              href={REPO_URL}
              target="_blank"
              rel="noreferrer"
              aria-label="GitHub 仓库"
              title="GitHub 仓库"
            >
              <GithubMark className="size-4" />
            </a>
          </Button>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

// lucide 已移除品牌图标，这里内置 GitHub 官方 mark 的 path
function GithubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden className={className}>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.012 8.012 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}
