/* @meta
{
  "name": "xiaohongshu/search",
  "description": "搜索小红书笔记",
  "domain": "www.xiaohongshu.com",
  "args": {
    "keyword": {"required": true, "description": "Search keyword"}
  },
  "capabilities": ["network"],
  "readOnly": true,
  "method": "C (pinia store, 走页面完整签名链路)",
  "example": "bb-browser site xiaohongshu/search 美食"
}
*/

async function(args) {
  if (!args.keyword) return {error: 'Missing argument: keyword'};

  // 方式 C: 调 pinia store action
  // search 接口需要完整的 X-S-Common（含浏览器指纹），自签名会被风控
  // 通过 pinia store 走页面完整的签名 + interceptor 链路
  const app = document.querySelector('#app')?.__vue_app__;
  const pinia = app?.config?.globalProperties?.$pinia;
  if (!pinia?._s) return {error: 'Pinia not found', hint: 'Page may not be fully loaded'};

  const searchStore = pinia._s.get('search');
  if (!searchStore) return {error: 'Search store not found'};

  // 设置关键词并触发搜索
  searchStore.mutateSearchValue(args.keyword);
  await searchStore.loadMore();

  // 从 __INITIAL_STATE__ 或 store 读结果需要等一下
  await new Promise(r => setTimeout(r, 500));

  // 读取 store 中的搜索结果
  // store 内部通过 axios interceptor 发请求，签名完整，零风控
  // 结果在 store state 里，但由于 Vue reactivity 不好直接序列化
  // 所以通过 network capture 读结果（方式 B 辅助）

  // 备选：直接从 DOM 读搜索结果
  const noteElements = document.querySelectorAll('section.note-item, [class*="note-item"]');
  if (noteElements.length > 0) {
    const notes = Array.from(noteElements).slice(0, 20).map(el => {
      const title = el.querySelector('[class*="title"], .desc')?.textContent?.trim();
      const author = el.querySelector('[class*="author"], .name')?.textContent?.trim();
      return {title, author};
    }).filter(n => n.title);
    if (notes.length > 0) return {keyword: args.keyword, count: notes.length, source: 'dom', notes};
  }

  // 如果 DOM 没有（SPA 还没渲染），提示用 network --with-body 方式
  return {
    keyword: args.keyword,
    triggered: true,
    hint: 'Search triggered via pinia store. Use bb-browser network requests --filter "search/notes" --with-body --json to read results.'
  };
}
