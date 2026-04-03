/* @meta
{
  "name": "xiaohongshu/search",
  "description": "搜索小红书笔记",
  "domain": "www.xiaohongshu.com",
  "args": {
    "keyword": {"required": true, "description": "Search keyword"},
    "count": {"required": false, "description": "Number of results (default 20)"}
  },
  "capabilities": ["network"],
  "readOnly": true,
  "example": "bb-browser site xiaohongshu/search 美食"
}
*/

async function(args) {
  if (!args.keyword) return {error: 'Missing argument: keyword'};

  var app = document.querySelector('#app')?.__vue_app__;
  var pinia = app?.config?.globalProperties?.$pinia;
  if (!pinia?._s) return {error: 'Page not ready', hint: 'Ensure xiaohongshu.com is fully loaded'};

  var userStore = pinia._s.get('user');
  if (!userStore?.loggedIn) return {error: 'Not logged in', hint: 'Run: bb-browser open https://www.xiaohongshu.com/explore — then log in manually'};

  var router = app.config.globalProperties.$router;
  var searchStore = pinia._s.get('search');
  if (!searchStore) return {error: 'Search store not found'};

  // SPA navigate to search results page (won't break CDP eval session)
  await router.push({path: '/search_result', query: {keyword: args.keyword, source: 'web_search_result_notes'}});

  // Wait for feeds to populate
  for (var i = 0; i < 15; i++) {
    if (searchStore.feeds?.length > 0) break;
    await new Promise(function(r) { setTimeout(r, 500); });
  }

  var feeds = searchStore.feeds || [];
  if (feeds.length === 0) return {error: 'No results', hint: 'Search may have been blocked or keyword has no results'};

  var count = parseInt(args.count) || 20;
  var notes = feeds.slice(0, count).map(function(item) {
    var nc = item.noteCard || item.note_card;
    return {
      id: item.id,
      xsec_token: item.xsecToken || item.xsec_token,
      title: nc?.displayTitle || nc?.display_title,
      type: nc?.type,
      url: 'https://www.xiaohongshu.com/explore/' + item.id,
      author: nc?.user?.nickname || nc?.user?.nickName,
      author_id: nc?.user?.userId || nc?.user?.user_id,
      likes: nc?.interactInfo?.likedCount || nc?.interact_info?.liked_count
    };
  });
  return {keyword: args.keyword, count: notes.length, has_more: !!searchStore.hasMore, notes: notes};
}
