/* @meta
{
  "name": "xiaohongshu/user_posts",
  "description": "获取小红书用户的笔记列表",
  "domain": "www.xiaohongshu.com",
  "args": {
    "user_id": {"required": true, "description": "User ID"}
  },
  "capabilities": ["network"],
  "readOnly": true,
  "example": "bb-browser site xiaohongshu/user_posts 5a927d8411be10720ae9e1e4"
}
*/

async function(args) {
  if (!args.user_id) return {error: 'Missing argument: user_id'};

  var app = document.querySelector('#app')?.__vue_app__;
  var pinia = app?.config?.globalProperties?.$pinia;
  if (!pinia?._s) return {error: 'Page not ready', hint: 'Ensure xiaohongshu.com is fully loaded'};

  var router = app.config.globalProperties.$router;
  var userStore = pinia._s.get('user');
  if (!userStore) return {error: 'User store not found'};
  if (!userStore.loggedIn) return {error: 'Not logged in', hint: 'Run: bb-browser open https://www.xiaohongshu.com/explore — then log in manually'};

  // SPA navigate to user profile (won't break CDP eval session)
  // Always navigate away first to force store refresh
  var targetPath = '/user/profile/' + args.user_id;
  if (router.currentRoute.value.path.includes('/user/profile/')) {
    await router.push('/explore');
    await new Promise(function(r) { setTimeout(r, 500); });
  }
  await router.push(targetPath);

  // Wait for notes to populate (notes is a 2D array — check flat count)
  for (var i = 0; i < 15; i++) {
    var flatCount = 0;
    for (var g of (userStore.notes || [])) {
      flatCount += Array.isArray(g) ? g.length : (g ? 1 : 0);
    }
    if (flatCount > 0) break;
    await new Promise(function(r) { setTimeout(r, 500); });
  }

  // notes is a 2D array (groups of notes) — flatten it
  var flat = [];
  for (var group of (userStore.notes || [])) {
    if (Array.isArray(group)) {
      for (var item of group) flat.push(item);
    } else {
      flat.push(group);
    }
  }

  var notes = flat.map(function(n) {
    var nc = n.noteCard || n.note_card || n;
    return {
      note_id: n.id || n.noteId || n.note_id,
      title: nc.displayTitle || nc.display_title,
      type: nc.type,
      url: 'https://www.xiaohongshu.com/explore/' + (n.id || n.noteId || n.note_id),
      likes: nc.interactInfo?.likedCount || nc.interact_info?.liked_count,
      xsec_token: n.xsecToken || n.xsec_token
    };
  });

  return {user_id: args.user_id, count: notes.length, notes: notes};
}
