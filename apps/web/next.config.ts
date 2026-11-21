import path from 'node:path';

import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@qianxu/shared'],
  output: 'standalone',
  // monorepo 下 trace 根指到仓库根，standalone 产物才会保留 apps/web 目录结构
  outputFileTracingRoot: path.join(__dirname, '../..'),
};

export default nextConfig;
