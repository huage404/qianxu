// 站点 origin 的唯一配置源，取值来自构建期的 WXT_SITE_ORIGINS
// （仓库根目录的 .env，或命令行传入；逗号分隔的完整 origin，含协议、443 不写端口）。
// 开发构建未设置时回退到本地开发地址；生产构建缺它会直接构建失败。
import { buildMatchPatterns, parseSiteOrigins } from '@/utils/site-config';

export const SITE_ORIGINS: readonly string[] = parseSiteOrigins(
  import.meta.env.WXT_SITE_ORIGINS,
);

const ALLOWED_ORIGINS = new Set<string>(SITE_ORIGINS);

export function isAllowedOrigin(origin: string): boolean {
  return ALLOWED_ORIGINS.has(origin);
}

export function toMatchPatterns(): string[] {
  return buildMatchPatterns(SITE_ORIGINS);
}
