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
  "example": "bb-browser site xiaohongshu/search 美食"
}
*/

async function(args) {
  if (!args.keyword) return {error: 'Missing argument: keyword'};
  const keyword = String(args.keyword).trim();
  if (!keyword) return {error: 'Missing argument: keyword'};

  const app = document.querySelector('#app')?.__vue_app__;
  const pinia = app?.config?.globalProperties?.$pinia;
  if (!pinia?._s) return {error: 'Page not ready', hint: 'Not logged in?'};

  const searchStore = pinia._s.get('search');
  if (!searchStore) return {error: 'Search store not found', hint: 'Not logged in?'};

  const serializeFeeds = (feeds) => (feeds || []).map(i => ({
    id: i.id, xsec_token: i.xsecToken,
    title: i.noteCard?.displayTitle, type: i.noteCard?.type,
    url: 'https://www.xiaohongshu.com/explore/' + i.id,
    author: i.noteCard?.user?.nickname,
    likes: i.noteCard?.interactInfo?.likedCount
  }));
  const makeSearchId = () => Array.from(
    {length: 21},
    () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]
  ).join('');
  const initialStoreNotes = serializeFeeds(searchStore.feeds).filter(n => n.id && (n.title || n.author));
  const initialContextKeyword = String(searchStore.searchContext?.keyword || '').trim();
  if (initialStoreNotes.length && initialContextKeyword === keyword) {
    return {keyword, count: initialStoreNotes.length, has_more: searchStore.hasMore, notes: initialStoreNotes};
  }

  let captured = null;
  let loadError = null;
  let requestCaptured = false;
  const targetSearchId = makeSearchId();
  let resolveCapture;
  const capturePromise = new Promise(r => { resolveCapture = r; });
  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function(m, u) {
    this.__url = u;
    return origOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function(b) {
    let body = b;
    if (!requestCaptured && this.__url?.includes('search/notes') && typeof body === 'string') {
      try {
        const parsed = JSON.parse(body);
        parsed.keyword = keyword;
        parsed.page = 1;
        parsed.search_id = targetSearchId;
        body = JSON.stringify(parsed);
      } catch {}
      requestCaptured = true;
      this.addEventListener('loadend', () => {
        if (captured || this.readyState !== 4) return;
        try {
          captured = JSON.parse(this.responseText);
        } catch {}
        resolveCapture();
      }, {once: true});
    }
    return origSend.call(this, body);
  };

  try {
    if (typeof searchStore.resetSearchNoteStore === 'function') {
      await Promise.resolve(searchStore.resetSearchNoteStore());
    }
    if (typeof searchStore.resetSearchRelatedInfo === 'function') {
      await Promise.resolve(searchStore.resetSearchRelatedInfo());
    }
    if (searchStore.searchValue !== keyword) {
      searchStore.mutateSearchValue(keyword);
    }
    if (searchStore.searchContext && typeof searchStore.searchContext === 'object') {
      searchStore.searchContext.keyword = keyword;
      searchStore.searchContext.page = 1;
      searchStore.searchContext.searchId = targetSearchId;
    }
    if (typeof searchStore.setRootSearchId === 'function') {
      searchStore.setRootSearchId(targetSearchId);
    }
    Promise.resolve(searchStore.loadMore()).catch(err => {
      loadError = String(err);
      resolveCapture();
    });
    await Promise.race([
      capturePromise,
      new Promise(r => setTimeout(r, 5000))
    ]);
  } finally {
    XMLHttpRequest.prototype.open = origOpen;
    XMLHttpRequest.prototype.send = origSend;
  }

  if (captured?.success) {
    const notes = (captured.data?.items || []).map(i => ({
      id: i.id, xsec_token: i.xsec_token,
      title: i.note_card?.display_title, type: i.note_card?.type,
      url: 'https://www.xiaohongshu.com/explore/' + i.id,
      author: i.note_card?.user?.nickname,
      likes: i.note_card?.interact_info?.liked_count
    }));
    return {keyword, count: notes.length, has_more: captured.data?.has_more, notes};
  }

  const storeNotes = serializeFeeds(searchStore.feeds).filter(n => n.id && (n.title || n.author));
  const contextKeyword = String(searchStore.searchContext?.keyword || '').trim();
  if (storeNotes.length && contextKeyword === keyword) {
    return {keyword, count: storeNotes.length, has_more: searchStore.hasMore, notes: storeNotes};
  }

  if (!captured) return {error: loadError || 'Search request not captured', hint: 'Search page state may be stale; retry once from the search page.'};
  return {error: captured?.msg || loadError || 'Search failed', hint: 'Not logged in?'};
}
