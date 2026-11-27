import { existsSync } from 'node:fs';
import path from 'node:path';

import { defineConfig } from 'wxt';

import { buildMatchPatterns, parseSiteOrigins } from './utils/site-config';

// 环境变量统一放在仓库根目录的 .env（模板见 .env.example）。
// WXT 只按 process.cwd() 找应用目录下的 .env，够不到仓库根，所以这里自己加载一次。
// loadEnvFile 不覆盖已有的键，命令行与 CI 传入的值优先。
loadRootEnv();

function loadRootEnv(): void {
  if (typeof process.loadEnvFile !== 'function') return;
  let dir = process.cwd();
  while (dir !== path.dirname(dir)) {
    if (existsSync(path.join(dir, 'pnpm-workspace.yaml'))) {
      const envFile = path.join(dir, '.env');
      if (existsSync(envFile)) process.loadEnvFile(envFile);
      return;
    }
    dir = path.dirname(dir);
  }
}

const siteOrigins = parseSiteOrigins(process.env.WXT_SITE_ORIGINS);

export default defineConfig({
  dev: {
    server: {
      port: 3010,
    },
  },
  webExt: {
    startUrls: ['http://localhost:3000'],
  },
  manifest: ({ browser, command }) => {
    // 漏配 origin 会静默退回 localhost 白名单：扩展装得上、生产页却不注入，
    // 排查代价远高于一次构建失败，所以生产构建直接拦下。
    if (command === 'build' && !process.env.WXT_SITE_ORIGINS?.trim()) {
      throw new Error(
        '生产构建缺少 WXT_SITE_ORIGINS：请 cp .env.example .env 并填写，' +
          '或临时用 WXT_SITE_ORIGINS="https://你的域名" pnpm zip:ext 传入。',
      );
    }
    return {
      name: 'Qianxu 书签',
      description: '读取浏览器收藏夹，并在 Qianxu 站点展示；收藏与删除直接写入浏览器收藏夹。',
      // 静态声明，装上即接管浏览器新标签页，运行期无法关闭；
      // 目标地址由构建期 WXT_SITE_ORIGINS 的第一项决定（见 entrypoints/newtab/main.ts）。
      chrome_url_overrides: {
        newtab: 'newtab.html',
      },
      permissions: [
        'storage',
        'bookmarks',
        'activeTab',
        // favicon API 目前只有 Chromium 系浏览器支持
        ...(browser === 'chrome' ? ['favicon'] : []),
      ],
      ...(browser === 'chrome'
        ? {
            // 页面用 <img> 加载 _favicon 时，资源必须对站点可访问
            web_accessible_resources: [
              {
                resources: ['_favicon/*'],
                matches: buildMatchPatterns(siteOrigins),
              },
            ],
          }
        : {}),
    };
  },
});
