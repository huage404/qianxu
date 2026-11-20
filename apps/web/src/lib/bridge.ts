import {
  MSG_SOURCE_WEB,
  isBookmarksResponse,
  isBookmarksUpdated,
  type Bookmark,
  type WebToExtensionMessage,
} from '@qianxu/shared';

const DEFAULT_TIMEOUT_MS = 800;

export function requestBookmarks(timeoutMs = DEFAULT_TIMEOUT_MS): Promise<Bookmark[] | null> {
  return new Promise((resolve) => {
    const requestId = crypto.randomUUID();

    const cleanup = () => {
      window.removeEventListener('message', onMessage);
      window.clearTimeout(timer);
    };

    const onMessage = (event: MessageEvent) => {
      if (event.source !== window) return;
      if (!isBookmarksResponse(event.data)) return;
      if (event.data.requestId !== requestId) return;
      cleanup();
      resolve(event.data.bookmarks);
    };

    const timer = window.setTimeout(() => {
      cleanup();
      resolve(null);
    }, timeoutMs);

    window.addEventListener('message', onMessage);

    const request: WebToExtensionMessage = {
      source: MSG_SOURCE_WEB,
      type: 'BOOKMARKS_REQUEST',
      requestId,
    };
    window.postMessage(request, window.location.origin);
  });
}

export function subscribeBookmarks(listener: (bookmarks: Bookmark[]) => void): () => void {
  const onMessage = (event: MessageEvent) => {
    if (event.source !== window) return;
    if (!isBookmarksUpdated(event.data)) return;
    listener(event.data.bookmarks);
  };
  window.addEventListener('message', onMessage);
  return () => window.removeEventListener('message', onMessage);
}
