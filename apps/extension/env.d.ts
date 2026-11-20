// WXT 只把 WXT_ 前缀的环境变量注入 import.meta.env
interface ImportMetaEnv {
  readonly WXT_SITE_ORIGINS?: string;
}
