import { defineConfig } from 'wxt';

export default defineConfig({
  dev: {
    server: {
      port: 3010,
    },
  },
  webExt: {
    startUrls: ['http://localhost:3000'],
  },
  manifest: {
    name: 'Qianxu 书签',
    description: '读取浏览器收藏夹，并在 Qianxu 站点展示；收藏与删除直接写入浏览器收藏夹。',
    permissions: ['storage', 'bookmarks', 'activeTab'],
  },
});
