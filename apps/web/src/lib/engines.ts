export interface SearchEngine {
  id: string;
  label: string;
  action: string;
  param: string;
}

export const SEARCH_ENGINES = [
  { id: 'google', label: 'Google', action: 'https://www.google.com/search', param: 'q' },
  { id: 'baidu', label: '百度', action: 'https://www.baidu.com/s', param: 'wd' },
  { id: 'bing', label: '必应', action: 'https://www.bing.com/search', param: 'q' },
] as const satisfies readonly SearchEngine[];

export const DEFAULT_ENGINE_ID = SEARCH_ENGINES[0].id;
export const ENGINE_STORAGE_KEY = 'qianxu:engine';

export function getEngine(id: string): SearchEngine {
  return SEARCH_ENGINES.find((engine) => engine.id === id) ?? SEARCH_ENGINES[0];
}
