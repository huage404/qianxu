import { useState } from 'react';
import { isHttpUrl } from '@qianxu/shared';

import { cn } from '@/lib/utils';

export function requireTitle(value: string): string | null {
  return value.trim() ? null : '标题不能为空';
}

export function requireHttpUrl(value: string): string | null {
  return isHttpUrl(value.trim()) ? null : '链接必须是 http 或 https 地址';
}

interface InlineFieldProps {
  value: string;
  /** 输入框的无障碍名称，例如「书签标题」 */
  label: string;
  /** 未进入编辑态时悬停给出的操作提示 */
  hint: string;
  className?: string;
  /** 由外部控制「一开始就在编辑」，用于新建文件夹后立刻改名 */
  startEditing?: boolean;
  validate?: (value: string) => string | null;
  onCommit: (value: string) => void;
  onInvalid: (message: string) => void;
  /** Esc 放弃时通知外部，好让由外部持有的编辑状态一起收掉 */
  onCancel?: () => void;
}

/**
 * 点一下就地变成输入框，回车或失焦提交，Esc 放弃。
 * 校验不过时保持编辑状态，让用户改完再来，而不是悄悄退回旧值。
 */
export function InlineField({
  value,
  label,
  hint,
  className,
  startEditing = false,
  validate = requireTitle,
  onCommit,
  onInvalid,
  onCancel,
}: InlineFieldProps) {
  const [editing, setEditing] = useState(startEditing);
  const [draft, setDraft] = useState(value);

  if (!editing) {
    return (
      <button
        type="button"
        className={cn(
          'w-full min-w-0 truncate rounded-sm text-left outline-none hover:bg-accent/70 focus-visible:ring-[3px] focus-visible:ring-ring/30',
          className,
        )}
        title={hint}
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
      >
        {value}
      </button>
    );
  }

  const commit = () => {
    const next = draft.trim();
    const problem = validate(next);
    if (problem) {
      onInvalid(problem);
      return;
    }
    setEditing(false);
    if (next !== value) onCommit(next);
  };

  return (
    <input
      autoFocus
      value={draft}
      // 不用 type="url"：浏览器的原生校验会抢在 commit 之前拦下回车，
      // 而这里的提示文案要由 onInvalid 统一给到页面
      type="text"
      spellCheck={false}
      aria-label={label}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          commit();
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          setEditing(false);
          onCancel?.();
        }
      }}
      className={cn(
        'w-full min-w-0 rounded-sm border bg-background px-1 py-0.5 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30',
        className,
      )}
    />
  );
}
