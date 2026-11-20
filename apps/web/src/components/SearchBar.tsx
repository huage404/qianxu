'use client';

import { useEffect, useState } from 'react';
import { ArrowRight, Search } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DEFAULT_ENGINE_ID, ENGINE_STORAGE_KEY, SEARCH_ENGINES, getEngine } from '@/lib/engines';

export function SearchBar() {
  const [engineId, setEngineId] = useState<string>(DEFAULT_ENGINE_ID);

  useEffect(() => {
    const saved = window.localStorage.getItem(ENGINE_STORAGE_KEY);
    if (saved && SEARCH_ENGINES.some((engine) => engine.id === saved)) {
      setEngineId(saved);
    }
  }, []);

  const engine = getEngine(engineId);

  const handleChange = (id: string) => {
    setEngineId(id);
    window.localStorage.setItem(ENGINE_STORAGE_KEY, id);
  };

  return (
    <form
      action={engine.action}
      method="get"
      target="_blank"
      className="flex w-full items-center gap-1 rounded-2xl border border-border bg-card p-2 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_18px_40px_-28px_rgba(0,0,0,0.35)] transition-[border-color,box-shadow] duration-200 focus-within:border-ring/50 focus-within:ring-4 focus-within:ring-ring/10"
    >
      <Select value={engineId} onValueChange={handleChange}>
        <SelectTrigger
          aria-label="搜索引擎"
          className="h-11 w-[104px] shrink-0 gap-1.5 rounded-xl border-0 bg-transparent px-2.5 text-sm font-medium text-muted-foreground shadow-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-0 data-[state=open]:bg-accent data-[state=open]:text-foreground sm:w-[118px] sm:px-3"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="start" className="min-w-[118px]">
          {SEARCH_ENGINES.map((item) => (
            <SelectItem key={item.id} value={item.id}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <span aria-hidden className="hidden h-5 w-px shrink-0 bg-border sm:block" />

      <div className="relative flex min-w-0 flex-1 items-center">
        <Search className="pointer-events-none absolute left-3 size-4 text-muted-foreground" />
        <Input
          name={engine.param}
          placeholder="输入关键词，回车搜索"
          autoComplete="off"
          autoFocus
          required
          enterKeyHint="search"
          aria-label="搜索关键词"
          className="h-11 min-w-0 rounded-xl border-0 bg-transparent pr-3 pl-9 text-base shadow-none placeholder:text-muted-foreground focus-visible:ring-0 sm:pr-14"
        />
        <kbd className="pointer-events-none absolute right-3 hidden rounded border bg-muted px-1.5 py-0.5 font-sans text-[10px] leading-4 font-medium text-muted-foreground sm:block">
          Enter
        </kbd>
      </div>

      <Button
        type="submit"
        aria-label="搜索"
        className="size-11 shrink-0 rounded-xl px-0 sm:w-auto sm:px-5"
      >
        <span className="hidden sm:inline">搜索</span>
        <ArrowRight className="size-4 opacity-80" />
      </Button>
    </form>
  );
}
