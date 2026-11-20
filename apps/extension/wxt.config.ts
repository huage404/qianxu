import { defineConfig } from 'wxt';

import { buildMatchPatterns, parseSiteOrigins } from './utils/site-config';

// .env 文件在加载配置时还不可用，生产构建请用命令行传入：
//   WXT_SITE_ORIGINS="https://qianxu.app" pnpm build
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
  manifest: ({ browser }) => ({
    name: 'Qianxu 书签',
    description: '读取浏览器收藏夹，并在 Qianxu 站点展示；收藏与删除直接写入浏览器收藏夹。',
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
  }),
});
