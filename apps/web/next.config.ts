import { existsSync } from 'node:fs';
import path from 'node:path';

import type { NextConfig } from 'next';

// 环境变量统一放在仓库根目录的 .env（模板见 .env.example）。
// Next 只读应用目录下的 .env*，够不到仓库根，所以这里自己加载一次。
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

const nextConfig: NextConfig = {
  transpilePackages: ['@qianxu/shared'],
  output: 'standalone',
  // monorepo 下 trace 根指到仓库根，standalone 产物才会保留 apps/web 目录结构
  outputFileTracingRoot: path.join(__dirname, '../..'),
};

export default nextConfig;
