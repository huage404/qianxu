import { useState } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  FolderInput,
  Link as LinkIcon,
  MoreHorizontal,
  Pencil,
  Trash2,
} from 'lucide-react';

import {
  Menu,
  MenuAnchor,
  MenuContent,
  MenuItem,
  MenuSeparator,
} from '@/components/ui/menu';
import type { MoveTarget } from '@/lib/folders';

export interface MenuAnchorPoint {
  x: number;
  y: number;
  align: 'start' | 'end';
}

interface BookmarkActionsProps {
  /** 用来给焦点归还逻辑定位到具体卡片 */
  subjectId: string;
  /** 菜单标题，读屏时说明这是谁的操作 */
  subject: string;
  anchor: MenuAnchorPoint | null;
  targets: MoveTarget[];
  onOpen: (anchor: MenuAnchorPoint) => void;
  onClose: () => void;
  /**
   * 动作会打开行内编辑器时，由调用方在这一刻接走焦点。
   *
   * 不能在 setEditing 之后立刻 focus：菜单退场动画期间 FocusScope 还锁着焦点，
   * 早一帧抢到的会被 Radix 拉回去。onCloseAutoFocus 才是 Radix 准备交还焦点的时刻。
   */
  onHandoff?: () => void;
  onRename: () => void;
  onEditUrl: () => void;
  onMoveTo: (folderId: string) => void;
  onDelete: () => void;
}

/**
 * 卡片的动作列表。⋯ 点击和右键打开的是同一份定义：
 * 两者都算出自己的锚点坐标，差别只在锚点落在按钮边缘还是光标上。
 * 两份菜单各写一遍迟早会漂，这里只有一份。
 */
export function BookmarkActions({
  subjectId,
  subject,
  anchor,
  targets,
  onOpen,
  onClose,
  onHandoff,
  onRename,
  onEditUrl,
  onMoveTo,
  onDelete,
}: BookmarkActionsProps) {
  const [view, setView] = useState<'actions' | 'move'>('actions');
  // 动作会打开行内编辑器时，菜单不能再把焦点抢回触发按钮，
  // 否则输入框刚挂载就 blur，既进不了编辑状态也会顺带提交一次
  const [handingOff, setHandingOff] = useState(false);

  const takeOverFocus = (run: () => void) => {
    setHandingOff(true);
    run();
  };

  const openFromButton = (event: React.MouseEvent<HTMLButtonElement>) => {
    // 不挡住就会连带切换卡片选中态
    event.stopPropagation();
    if (anchor !== null) {
      onClose();
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    onOpen({ x: rect.right, y: rect.bottom, align: 'end' });
  };

  return (
    <>
      <button
        type="button"
        data-card-menu-trigger={subjectId}
        aria-label={`「${subject}」的操作`}
        aria-haspopup="menu"
        aria-expanded={anchor !== null}
        onClick={openFromButton}
        onContextMenu={(event) => event.stopPropagation()}
        className="absolute top-1.5 right-1.5 flex size-6 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/30"
      >
        <MoreHorizontal className="size-3.5" />
      </button>

      <Menu
        // react-menu 的 modal 默认是 false，而 dropdown-menu 默认 true：
        // 非模态下 Radix 不注册 Escape 处理、也不拦外部指针，菜单会关不掉。
        modal
        open={anchor !== null}
        onOpenChange={(next) => {
          if (!next) {
            setView('actions');
            onClose();
          }
        }}
      >
        {anchor && (
          <MenuAnchor
            style={{ position: 'fixed', left: anchor.x, top: anchor.y, width: 0, height: 0 }}
          />
        )}
        <MenuContent
          align={anchor?.align ?? 'end'}
          side="bottom"
          // 菜单经 Portal 渲染在 body，但 React 的事件沿组件树冒泡，
          // 不挡住的话点任意一项都会顺带切换这张卡片的选中态
          onClick={(event) => event.stopPropagation()}
          onCloseAutoFocus={(event) => {
            if (!handingOff) return;
            // 拦住 Radix 把焦点还给触发按钮，改由调用方交给行内编辑器
            event.preventDefault();
            setHandingOff(false);
            onHandoff?.();
          }}
        >
          {view === 'actions' ? (
            <>
              <MenuItem onSelect={() => takeOverFocus(onRename)}>
                <Pencil />
                重命名
              </MenuItem>
              <MenuItem onSelect={() => takeOverFocus(onEditUrl)}>
                <LinkIcon />
                修改链接
              </MenuItem>

              <MenuSeparator />

              <MenuItem
                onSelect={(event) => {
                  // 钻入不是终态动作，阻止 Radix 默认关闭菜单
                  event.preventDefault();
                  setView('move');
                }}
              >
                <FolderInput />
                移动到
                <ChevronRight className="ml-auto size-3.5 opacity-50" />
              </MenuItem>

              <MenuSeparator />

              <MenuItem variant="destructive" onSelect={onDelete}>
                <Trash2 />
                删除
              </MenuItem>
            </>
          ) : (
            <>
              <MenuItem
                onSelect={(event) => {
                  event.preventDefault();
                  setView('actions');
                }}
              >
                <ChevronLeft />
                返回
              </MenuItem>

              <MenuSeparator />

              {targets.length === 0 ? (
                <p className="px-2 py-1.5 text-[13px] text-muted-foreground">
                  没有可移入的文件夹
                </p>
              ) : (
                targets.map((target) => (
                  <MenuItem
                    key={target.id}
                    style={{ paddingLeft: `${8 + target.depth * 14}px` }}
                    onSelect={() => onMoveTo(target.id)}
                  >
                    {target.label}
                  </MenuItem>
                ))
              )}
            </>
          )}
        </MenuContent>
      </Menu>
    </>
  );
}

export function SelectedBadge() {
  return (
    <span
      aria-hidden
      className="absolute top-2 left-2 grid size-5 place-items-center rounded-full bg-primary text-primary-foreground shadow-sm"
    >
      <Check className="size-3 stroke-[3]" />
    </span>
  );
}
