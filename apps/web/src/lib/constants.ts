// zip 文件名里的版本号取自 apps/extension/package.json，与 Release tag 是两套编号：
// 发新版扩展时要同时改这里和那边，否则下载入口会 404。
export const EXTENSION_DOWNLOAD_URL =
  'https://github.com/huage404/qianxu/releases/download/v1.1.0/extension-0.2.0-chrome.zip';
