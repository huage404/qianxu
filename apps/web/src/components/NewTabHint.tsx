'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Download, House } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { EXTENSION_DOWNLOAD_URL } from '@/lib/constants';

/** install: 没装插件；upgrade: 装了旧版；taken: 当前插件已声明接管 */
export type NewTabState = 'install' | 'upgrade' | 'taken';

const STATUS_TEXT: Record<NewTabState, string> = {
  install: '当前浏览器还没有装插件，装好后新标签页就会指向本站。',
  upgrade: '插件已安装，但这个版本还没有接管新标签页，装一次新版即可生效。',
  taken: '浏览器新标签页已经指向本站，不需要再做任何设置。',
};

const TRIGGER_TITLE: Record<NewTabState, string> = {
  install: '把 Qianxu 设为浏览器新标签页',
  upgrade: '升级插件后即可把 Qianxu 设为浏览器新标签页',
  taken: '浏览器新标签页已由插件接管',
};

export function NewTabHint({ state }: { state: NewTabState }) {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const taken = state === 'taken';

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="text-muted-foreground hover:text-foreground"
        title={TRIGGER_TITLE[state]}
        onClick={() => setOpen(true)}
      >
        {taken ? <Check className="size-3.5" /> : <House className="size-3.5" />}
        <span className="hidden sm:inline">新标签页</span>
      </Button>

      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        onClick={(event) => {
          if (event.target === dialogRef.current) setOpen(false);
        }}
        className="m-auto w-[min(92vw,420px)] rounded-2xl border border-border bg-background p-0 text-foreground shadow-xl [&::backdrop]:bg-black/50"
      >
        <div className="p-6">
          <div className="flex items-center gap-2.5">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
              <House className="size-4.5" />
            </span>
            <h2 className="text-sm font-semibold">把 Qianxu 设为浏览器新标签页</h2>
          </div>

          <p className="mt-4 text-[13px] leading-relaxed text-muted-foreground">
            浏览器不允许网页自己改写新标签页，只能由配套插件声明。装好插件后，每次新建标签页都会直接打开本站。
          </p>

          <p className="mt-3 flex items-start gap-2 rounded-xl border border-dashed px-3 py-2.5 text-[12px] leading-relaxed">
            {taken && <Check className="mt-px size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />}
            <span>{STATUS_TEXT[state]}</span>
          </p>

          {!taken && (
            <Button size="sm" className="mt-4" asChild>
              <a href={EXTENSION_DOWNLOAD_URL} rel="noreferrer">
                <Download className="size-3.5" />
                下载插件
              </a>
            </Button>
          )}

          <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
            接管后无法在网页里关闭；想恢复浏览器默认新标签页，需要在扩展管理页移除 Qianxu 插件。
          </p>
        </div>
      </dialog>
    </>
  );
}
