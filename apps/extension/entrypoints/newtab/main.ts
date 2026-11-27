import { SITE_ORIGINS } from '@/utils/site';

// 新标签页只做一件事：跳回站点。用 replace 而不是 href，历史里不留这一页，
// 从书签返回时不会先卡在这个空白扩展页。
const [target] = SITE_ORIGINS;
if (target) location.replace(target);
