// 站点 origin 的唯一配置源。
// 生产构建通过 WXT_SITE_ORIGINS 注入，逗号分隔的完整 origin（含端口）：
//   WXT_SITE_ORIGINS="https://qianxu.app,https://www.qianxu.app" pnpm build
// 未设置时回退到本地开发地址。
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
