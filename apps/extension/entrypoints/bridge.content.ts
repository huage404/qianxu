import { browser } from 'wxt/browser';
import {
  MSG_SOURCE_EXT,
  bridgeLog,
  bridgeWarn,
  isBookmarksRequest,
  isLinkHealthMap,
  type Bookmark,
  type ExtensionToWebMessage,
  type LinkHealthMap,
} from '@qianxu/shared';

import {
  EXT_MSG_BOOKMARKS_CHANGED,
  EXT_MSG_GET_BOOKMARKS,
  EXT_MSG_HEALTH_CHANGED,
} from '@/utils/bookmarks';
import { SITE_ORIGINS, isAllowedOrigin, toMatchPatterns } from '@/utils/site';

// 注意：manifest 的 matches 同样在构建期固化。若当前页面的协议或域名不匹配，
// 本文件根本不会执行，也就不会有下面的日志 —— 此时要去 chrome://extensions 看已安装扩展的 matches。
export default defineContentScript({
  matches: toMatchPatterns(),
  runAt: 'document_end',
  main() {
    bridgeLog('content script 已注入', {
      currentOrigin: window.location.origin,
      allowedOrigins: SITE_ORIGINS,
    });

    // matches 只能匹配到主机名，这里按完整 origin（含端口）再拦一层；
    // 白名单之外的页面连监听都不注册。
    if (!isAllowedOrigin(window.location.origin)) {
      bridgeWarn('当前 origin 不在扩展白名单，未注册消息监听', {
        currentOrigin: window.location.origin,
        allowedOrigins: SITE_ORIGINS,
      });
      return;
    }

    window.addEventListener('message', (event) => {
      if (event.source !== window) return;
      if (event.origin !== window.location.origin) return;
      if (!isBookmarksRequest(event.data)) return;
      bridgeLog('收到页面请求', { requestId: event.data.requestId });
      void respond(event.data.requestId);
    });

    browser.runtime.onMessage.addListener((message) => {
      const type = (message as { type?: unknown } | null)?.type;
      if (type === EXT_MSG_BOOKMARKS_CHANGED) {
        void push();
        return;
      }
      if (type === EXT_MSG_HEALTH_CHANGED) {
        pushHealth((message as { health?: unknown } | null)?.health);
      }
    });
  },
});

async function fetchBookmarks(): Promise<{
  ok: boolean;
  bookmarks: Bookmark[];
  health: LinkHealthMap;
}> {
  try {
    const reply = (await browser.runtime.sendMessage({
      type: EXT_MSG_GET_BOOKMARKS,
    })) as { bookmarks?: Bookmark[]; health?: unknown } | undefined;
    if (!Array.isArray(reply?.bookmarks)) {
      bridgeWarn('后台未返回书签列表', { reply });
      return { ok: false, bookmarks: [], health: {} };
    }
    return {
      ok: true,
      bookmarks: reply.bookmarks,
      health: isLinkHealthMap(reply.health) ? reply.health : {},
    };
  } catch (error) {
    bridgeWarn('向后台请求书签失败', error);
    return { ok: false, bookmarks: [], health: {} };
  }
}

async function respond(requestId: string) {
  const { ok, bookmarks, health } = await fetchBookmarks();
  const response: ExtensionToWebMessage = {
    source: MSG_SOURCE_EXT,
    type: 'BOOKMARKS_RESPONSE',
    requestId,
    ok,
    bookmarks,
    health,
    newTabOverride: takesOverNewTab(),
  };
  bridgeLog('回应该请求', { requestId, ok, count: bookmarks.length });
  window.postMessage(response, window.location.origin);
}

// 接管是在装包那一刻就固化的，页面只能据此提示用户升级，无法代为开启。
function takesOverNewTab(): boolean {
  return typeof browser.runtime.getManifest().chrome_url_overrides?.newtab === 'string';
}

async function push() {
  const { ok, bookmarks, health } = await fetchBookmarks();
  const response: ExtensionToWebMessage = {
    source: MSG_SOURCE_EXT,
    type: 'BOOKMARKS_UPDATED',
    ok,
    bookmarks,
    health,
  };
  bridgeLog('推送书签变更', { ok, count: bookmarks.length });
  window.postMessage(response, window.location.origin);
}

/** 轮询只改健康度，不值得让页面重读一遍收藏夹 */
function pushHealth(value: unknown) {
  if (!isLinkHealthMap(value)) {
    bridgeWarn('后台推送的健康度形状不对，已忽略', { value });
    return;
  }
  const response: ExtensionToWebMessage = {
    source: MSG_SOURCE_EXT,
    type: 'HEALTH_UPDATED',
    health: value,
  };
  bridgeLog('推送健康度更新', { count: Object.keys(value).length });
  window.postMessage(response, window.location.origin);
}
