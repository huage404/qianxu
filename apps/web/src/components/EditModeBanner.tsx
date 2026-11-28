import { SquarePen } from 'lucide-react';

import { Button } from '@/components/ui/button';

/**
 * 编辑态的模式提示条。
 *
 * 顶栏那个按钮只改了自己的外观，不足以说明「整个页面换了一种操作方式」，
 * 而这里改的是用户真实的浏览器书签——状态和后果得一起摆在内容上方，而不是藏在图标里。
 */
export function EditModeBanner({ onExit }: { onExit: () => void }) {
  return (
    <div className="shrink-0 border-b border-primary/25 bg-primary/8">
      <div className="mx-auto flex h-10 w-full max-w-[1200px] items-center gap-2.5 px-5 sm:px-8">
        <SquarePen className="size-3.5 shrink-0 text-primary" />
        <p className="min-w-0 flex-1 truncate text-[12.5px] leading-none">
          <span className="font-medium text-foreground">编辑模式</span>
          <span className="text-foreground/80">
            {' '}
            · 改动直接写入浏览器收藏夹
            <span className="hidden lg:inline">
              ；点卡片选中，右键或 ⋯ 展开操作，拖到左侧文件夹归类
            </span>
          </span>
        </p>
        <Button
          size="sm"
          variant="outline"
          className="h-7 shrink-0 px-2.5 text-[12px]"
          onClick={onExit}
        >
          退出
        </Button>
      </div>
    </div>
  );
}
