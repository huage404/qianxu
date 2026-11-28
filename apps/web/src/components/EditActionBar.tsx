import { Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';

interface EditActionBarProps {
  count: number;
  busy: boolean;
  onDelete: () => void;
  onClear: () => void;
}

/** 只在真的选中了东西时出现，避免编辑态一进来就悬着一条空工具栏 */
export function EditActionBar({ count, busy, onDelete, onClear }: EditActionBarProps) {
  if (count === 0) return null;

  return (
    <div
      role="region"
      aria-label="批量操作"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-5"
    >
      <div className="pointer-events-auto flex items-center gap-1.5 rounded-full border bg-background/95 py-1.5 pr-1.5 pl-3 shadow-lg backdrop-blur">
        <span className="text-[13px] tabular-nums text-muted-foreground">已选 {count} 项</span>
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-foreground"
          onClick={onClear}
          disabled={busy}
        >
          取消
        </Button>
        <Button variant="destructive" size="sm" onClick={onDelete} disabled={busy}>
          <Trash2 className="size-3.5" />
          删除
        </Button>
      </div>
    </div>
  );
}
