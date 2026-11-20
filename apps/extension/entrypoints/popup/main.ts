import { browser } from 'wxt/browser';
import { isHttpUrl, type Bookmark } from '@qianxu/shared';

import { listBrowserBookmarks, watchBookmarks } from '@/utils/bookmarks';

const listEl = document.querySelector<HTMLUListElement>('#list')!;
const countEl = document.querySelector<HTMLSpanElement>('#count')!;
const statusEl = document.querySelector<HTMLParagraphElement>('#status')!;
const addBtn = document.querySelector<HTMLButtonElement>('#add')!;
const exportBtn = document.querySelector<HTMLButtonElement>('#export')!;

let statusTimer: number | undefined;

function setStatus(text: string) {
  statusEl.textContent = text;
  window.clearTimeout(statusTimer);
  if (text) {
    statusTimer = window.setTimeout(() => {
      statusEl.textContent = '';
    }, 2400);
  }
}

async function addCurrentPage() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  const url = tab?.url ?? '';
  if (!isHttpUrl(url)) {
    setStatus('当前页面不支持收藏');
    return;
  }

  try {
    const bookmarks = await listBrowserBookmarks();
    if (bookmarks.some((bookmark) => bookmark.url === url)) {
      setStatus('该页面已在收藏夹中');
      return;
    }
    await browser.bookmarks.create({ title: tab?.title?.trim() || url, url });
    setStatus('已加入浏览器收藏夹');
    await render();
  } catch {
    setStatus('无法写入浏览器收藏夹');
  }
}

async function removeBookmark(id: string) {
  try {
    await browser.bookmarks.remove(id);
    await render();
  } catch {
    setStatus('删除失败，请重试');
  }
}

function exportBookmarks(bookmarks: Bookmark[]) {
  const blob = new Blob([JSON.stringify(bookmarks, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'qianxu-bookmarks.json';
  link.click();
  URL.revokeObjectURL(url);
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

async function render() {
  const bookmarks = [...(await listBrowserBookmarks())].sort((a, b) => b.createdAt - a.createdAt);
  countEl.textContent = bookmarks.length ? String(bookmarks.length) : '';
  listEl.replaceChildren();

  if (bookmarks.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'empty';
    empty.textContent = '暂无收藏，点击上方按钮收藏当前页。';
    listEl.append(empty);
    return;
  }

  for (const bookmark of bookmarks) {
    const item = document.createElement('li');
    item.className = 'item';

    const link = document.createElement('a');
    link.href = bookmark.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.className = 'item-link';

    const title = document.createElement('span');
    title.className = 'item-title';
    title.textContent = bookmark.title || bookmark.url;

    const meta = document.createElement('span');
    meta.className = 'item-host';
    const folder = bookmark.folderPath?.join(' / ') ?? bookmark.folder;
    meta.textContent = folder ? `${folder} · ${hostOf(bookmark.url)}` : hostOf(bookmark.url);

    link.append(title, meta);

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'remove';
    remove.title = '从浏览器收藏夹删除';
    remove.textContent = '×';
    remove.addEventListener('click', () => void removeBookmark(bookmark.id));

    item.append(link, remove);
    listEl.append(item);
  }
}

addBtn.addEventListener('click', () => void addCurrentPage());
exportBtn.addEventListener('click', () => {
  void listBrowserBookmarks().then(exportBookmarks);
});

const unwatch = watchBookmarks(() => void render());
window.addEventListener('unload', unwatch);

void render();
