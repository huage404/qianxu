'use client';

import * as React from 'react';
import * as MenuPrimitive from '@radix-ui/react-menu';

import { cn } from '@/lib/utils';

// 直接建立在 radix 的 menu 基础原语上，而不是 dropdown-menu：
// 下拉菜单没法把内容锚到光标位置，而卡片的动作列表要同时响应 ⋯ 点击和右键，
// 两边必须渲染同一份定义，所以直接用两边共同的底层原语。
//
// 这层原语没有 Trigger（Trigger 是 dropdown-menu 加的），所以两种入口都走同一条路：
// 调用方算出锚点坐标，受控打开。少一套状态，也少一种「两边行为不一致」的可能。

function Menu(props: React.ComponentProps<typeof MenuPrimitive.Root>) {
  return <MenuPrimitive.Root data-slot="menu" {...props} />;
}

/** 虚拟锚点：把它摆到按钮边缘或光标处，内容就跟着落在那个位置 */
function MenuAnchor(props: React.ComponentProps<typeof MenuPrimitive.Anchor>) {
  return <MenuPrimitive.Anchor data-slot="menu-anchor" {...props} />;
}

function MenuContent({
  className,
  sideOffset = 4,
  children,
  ...props
}: React.ComponentProps<typeof MenuPrimitive.Content>) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Content
        data-slot="menu-content"
        sideOffset={sideOffset}
        className={cn(
          'z-50 min-w-[10rem] overflow-hidden rounded-lg border bg-popover p-1 text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
          className,
        )}
        {...props}
      >
        {children}
      </MenuPrimitive.Content>
    </MenuPrimitive.Portal>
  );
}

function MenuItem({
  className,
  variant = 'default',
  ...props
}: React.ComponentProps<typeof MenuPrimitive.Item> & {
  variant?: 'default' | 'destructive';
}) {
  return (
    <MenuPrimitive.Item
      data-slot="menu-item"
      data-variant={variant}
      className={cn(
        'relative flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*=size-])]:size-4',
        variant === 'destructive'
          ? 'text-destructive focus:bg-destructive/10 focus:text-destructive'
          : 'focus:bg-accent focus:text-accent-foreground',
        className,
      )}
      {...props}
    />
  );
}

function MenuSeparator(props: React.ComponentProps<typeof MenuPrimitive.Separator>) {
  return (
    <MenuPrimitive.Separator
      data-slot="menu-separator"
      className={cn('-mx-1 my-1 h-px bg-border', props.className)}
    />
  );
}

export {
  Menu,
  MenuAnchor,
  MenuContent,
  MenuItem,
  MenuSeparator,
};
