/* @meta
{
  "name": "xiaohongshu/search",
  "description": "搜索小红书笔记",
  "domain": "www.xiaohongshu.com",
  "args": {
    "keyword": {"required": true, "description": "Search keyword"}
  },
  "readOnly": true,
  "example": "bb-browser site xiaohongshu/search 美食"
}
*/

async function(args) {
  if (!args.keyword) return {error: 'Missing argument: keyword'};

  const app = document.querySelector('#app')?.__vue_app__;
  const pinia = app?.config?.globalProperties?.['$pinia'];
  if (!pinia?._s) return {error: 'Page not ready', hint: 'Ensure xiaohongshu.com is fully loaded'};

  const searchStore = pinia._s.get('search');
  if (!searchStore) return {error: 'Search store not found'};

  // Intercept search API responses (fetch + XHR)
  let captured = null;
  const origFetch = window.fetch;
  window.fetch = async function(url, opts) {
    const resp = await origFetch.apply(this, arguments);
    const urlStr = typeof url === 'string' ? url : url?.url || '';
    if (urlStr.includes('/search/notes') || urlStr.includes('/search_notes')) {
      try {
        const clone = resp.clone();
        const data = await clone.json();
        if (data?.data?.items?.length > 0) captured = data;
        else if (!captured) captured = data;
      } catch {}
    }
    return resp;
  };

  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function(m, u) { this.__url = u; return origOpen.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function(b) {
    if (this.__url && (this.__url.includes('/search/notes') || this.__url.includes('/search_notes'))) {
      const x = this;
      const origORS = x.onreadystatechange;
      x.onreadystatechange = function() {
        if (x.readyState === 4) {
          try {
            const data = JSON.parse(x.responseText);
            if (data?.data?.items?.length > 0) captured = data;
            else if (!captured) captured = data;
          } catch {}
        }
        if (origORS) origORS.apply(this, arguments);
      };
    }
    return origSend.apply(this, arguments);
  };

  try {
    // Reset search state and initialize context before searching
    if (searchStore.resetSearchNoteStore) searchStore.resetSearchNoteStore();
    if (searchStore.resetSearchFilter) searchStore.resetSearchFilter();

    searchStore.mutateSearchValue(args.keyword);

    if (searchStore.updateKeywordFrom) searchStore.updateKeywordFrom('web_search_result_notes');
    if (searchStore.setRootSearchId) searchStore.setRootSearchId(Math.random().toString(36).substring(2));

    if (searchStore.searchNotes) {
      await searchStore.searchNotes();
    } else if (searchStore.loadMore) {
      await searchStore.loadMore();
    }

    await new Promise(r => setTimeout(r, 2000));
  } finally {
    window.fetch = origFetch;
    XMLHttpRequest.prototype.open = origOpen;
    XMLHttpRequest.prototype.send = origSend;
  }

  if (!captured?.success && !captured?.data?.items) {
    return {error: captured?.msg || 'Search failed', hint: 'Not logged in?'};
  }

  const notes = (captured.data?.items || [])
    .filter(i => i.id && i.note_card)
    .map(i => ({
      id: i.id, xsec_token: i.xsec_token,
      title: i.note_card?.display_title, type: i.note_card?.type,
      url: 'https://www.xiaohongshu.com/explore/' + i.id,
      author: i.note_card?.user?.nickname,
      likes: i.note_card?.interact_info?.liked_count
    }));

  return {keyword: args.keyword, count: notes.length, has_more: captured.data?.has_more, notes};
}
