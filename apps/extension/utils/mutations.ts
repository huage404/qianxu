import { browser } from 'wxt/browser';
import { isHttpUrl, type BookmarkOp } from '@qianxu/shared';

import type { BookmarkNode } from '@/utils/bookmark-tree';

export interface OpResult {
  ok: boolean;
  error?: string;
}

/**
 * 顺序执行一批书签编辑，单条失败不中断其余。
 *
 * 页面递过来的是节点 id，而 id 来自上一帧的书签树，可能早就变了；
 * 浏览器收藏夹又是用户的真实数据，所以每个 op 落笔前都要重新对着当前树核一遍身份。
 */
export async function applyOps(ops: BookmarkOp[]): Promise<OpResult[]> {
  const tree = await browser.bookmarks.getTree();
  const index = indexTree(tree);
  const containers = defaultContainerIds(tree);

  const results: OpResult[] = [];
  for (const op of ops) {
    try {
      results.push(await applyOp(op, index, containers));
    } catch {
      results.push({ ok: false, error: '浏览器拒绝了这次操作' });
    }
  }
  return results;
}

async function applyOp(
  op: BookmarkOp,
  index: Map<string, BookmarkNode>,
  containers: Set<string>,
): Promise<OpResult> {
  switch (op.kind) {
    case 'rename': {
      const title = op.title.trim();
      if (!title) return fail('标题不能为空');
      const node = requireNode(index, op.id);
      if (!node) return fail('要找的条目已经不在了');
      if (containers.has(node.id)) return fail('浏览器默认文件夹不能重命名');
      await browser.bookmarks.update(node.id, { title });
      return ok;
    }

    case 'setUrl': {
      const url = op.url.trim();
      if (!isHttpUrl(url)) return fail('链接必须是 http 或 https 地址');
      const node = requireNode(index, op.id);
      if (!node) return fail('要找的条目已经不在了');
      // 默认容器和用户文件夹都没有 url，改链接只对书签生效
      if (!node.url) return fail('文件夹没有链接可改');
      await browser.bookmarks.update(node.id, { url });
      return ok;
    }

    case 'move': {
      const node = requireNode(index, op.id);
      if (!node) return fail('要找的条目已经不在了');
      if (containers.has(node.id)) return fail('浏览器默认文件夹不能被移动');
      const target = index.get(op.intoFolderId);
      if (!target) return fail('目标文件夹已经不在了');
      if (target.url) return fail('只能移动到文件夹里，目标是一个书签');
      if (target.id === node.id) return fail('不能移动到它自己里面');
      await browser.bookmarks.move(node.id, { parentId: target.id });
      return ok;
    }

    case 'remove': {
      const node = requireNode(index, op.id);
      if (!node) return fail('要找的条目已经不在了');
      if (!node.url) return fail('这是文件夹，请用删除文件夹');
      await browser.bookmarks.remove(node.id);
      return ok;
    }

    case 'removeFolder': {
      const node = requireNode(index, op.id);
      if (!node) return fail('要找的文件夹已经不在了');
      if (node.url) return fail('这是书签，请用删除书签');
      if (containers.has(node.id)) return fail('浏览器默认文件夹不能删除');
      await browser.bookmarks.removeTree(node.id);
      return ok;
    }

    case 'createFolder': {
      const title = op.title.trim();
      if (!title) return fail('文件夹名不能为空');
      const parent = index.get(op.parentId);
      if (!parent) return fail('上级文件夹已经不在了');
      if (parent.url) return fail('书签里面不能放文件夹');
      await browser.bookmarks.create({ parentId: parent.id, title });
      return ok;
    }
  }
}

function requireNode(index: Map<string, BookmarkNode>, id: string): BookmarkNode | undefined {
  return index.get(id);
}

/**
 * 根节点和它的直接子节点（书签栏、其他书签、移动设备书签）都不是用户能改的文件夹。
 * 只认遍历出来的父子关系，不读 node.parentId 字段，免得两处身份来源对不上。
 */
function defaultContainerIds(tree: BookmarkNode[]): Set<string> {
  const ids = new Set<string>();
  for (const root of tree) {
    ids.add(root.id);
    for (const child of root.children ?? []) ids.add(child.id);
  }
  return ids;
}

function indexTree(nodes: BookmarkNode[], into = new Map<string, BookmarkNode>()) {
  for (const node of nodes) {
    into.set(node.id, node);
    if (node.children) indexTree(node.children, into);
  }
  return into;
}

const ok: OpResult = { ok: true };
function fail(error: string): OpResult {
  return { ok: false, error };
}
