import type { DragEvent } from 'react';

/** 自定义 MIME：避免和页面里其他可拖拽内容、以及外部拖入的文件混在一起 */
export const DRAG_MIME = 'application/x-qianxu-bookmark-ids';

export interface DragState {
  /** 当前被拖过的落点文件夹 id，null 表示没有 */
  over: string | null;
  setOver: (id: string | null) => void;
  onDrop: (ids: string[], folderId: string) => void;
}

export function readDragIds(event: DragEvent): string[] {
  const raw = event.dataTransfer.getData(DRAG_MIME);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === 'string');
  } catch {
    // 外部拖进来的东西也可能声称是这个类型，解析不了就当没带
    return [];
  }
}

/**
 * 落点只需要 dragover 和 drop 两个事件。
 *
 * 不挂 dragleave：dragleave 在指针掠过落点的子元素时也会触发，
 * 用它清高亮会一闪一闪。改成「最后一次收到 dragover 的目标就是当前目标」，
 * 换落点时新目标的 dragover 自然把旧的顶掉，收尾交给拖拽源的 dragend。
 */
export function dropProps(folderId: string, drag: DragState) {
  return {
    onDragOver: (event: DragEvent) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      if (drag.over !== folderId) drag.setOver(folderId);
    },
    onDrop: (event: DragEvent) => {
      event.preventDefault();
      drag.setOver(null);
      drag.onDrop(readDragIds(event), folderId);
    },
  };
}
