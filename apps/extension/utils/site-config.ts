// 纯函数模块：manifest 配置与运行时（site.ts）共用，不依赖 import.meta.env。

export const DEFAULT_SITE_ORIGINS = ['http://localhost:3000', 'http://127.0.0.1:3000'];

export function parseSiteOrigins(raw: string | undefined): string[] {
  const values = (raw ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  if (values.length === 0) return [...DEFAULT_SITE_ORIGINS];

  return [
    ...new Set(
      values.map((value) => {
        let url: URL;
        try {
          url = new URL(value);
        } catch {
          throw new Error(`WXT_SITE_ORIGINS 中的 origin 无法解析：${value}`);
        }
        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
          throw new Error(`WXT_SITE_ORIGINS 只支持 http(s) origin：${value}`);
        }
        return url.origin;
      }),
    ),
  ];
}

// manifest 的 matches 不支持端口，只能按协议 + 主机名生成；
// 端口由 isAllowedOrigin 在运行时校验。
export function buildMatchPatterns(origins: readonly string[]): string[] {
  return [
    ...new Set(
      origins.map((origin) => {
        const { protocol, hostname } = new URL(origin);
        return `${protocol}//${hostname}/*`;
      }),
    ),
  ];
}
