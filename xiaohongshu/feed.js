/* @meta
{
  "name": "xiaohongshu/feed",
  "description": "获取小红书首页推荐 Feed",
  "domain": "www.xiaohongshu.com",
  "args": {},
  "capabilities": ["network"],
  "readOnly": true
}
*/

async function(args) {
  var app = document.querySelector('#app')?.__vue_app__;
  var pinia = app?.config?.globalProperties?.$pinia;
  if (!pinia?._s) return {error: 'Page not ready', hint: 'Ensure xiaohongshu.com is fully loaded'};

  var userStore = pinia._s.get('user');
  if (!userStore?.loggedIn) return {error: 'Not logged in', hint: 'Run: bb-browser open https://www.xiaohongshu.com/explore — then log in manually'};

  var router = app.config.globalProperties.$router;
  var feedStore = pinia._s.get('feed');
  if (!feedStore) return {error: 'Feed store not found'};

  // Navigate to explore page via SPA router
  if (!router.currentRoute.value.path.includes('/explore')) {
    await router.push('/explore');
    await new Promise(function(r) { setTimeout(r, 2000); });
  }

  // Trigger a fresh fetch
  if (feedStore.fetchFeeds) await feedStore.fetchFeeds();

  // Wait for feeds to populate
  for (var i = 0; i < 10; i++) {
    if (feedStore.feeds?.length > 0) break;
    await new Promise(function(r) { setTimeout(r, 500); });
  }

  var feeds = feedStore.feeds || [];
  if (feeds.length === 0) return {error: 'No feed data', hint: 'Page may not be fully loaded'};

  var notes = feeds.map(function(item) {
    var nc = item.noteCard || item.note_card;
    if (!nc) return null;
    return {
      id: item.id,
      xsec_token: item.xsecToken || item.xsec_token,
      title: nc.displayTitle || nc.display_title,
      type: nc.type,
      url: 'https://www.xiaohongshu.com/explore/' + item.id,
      author: nc.user?.nickname || nc.user?.nickName,
      author_id: nc.user?.userId || nc.user?.user_id,
      likes: nc.interactInfo?.likedCount || nc.interact_info?.liked_count
    };
  }).filter(Boolean);

  return {count: notes.length, has_more: feedStore.hasMore !== false, notes: notes};
}
