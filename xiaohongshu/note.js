/* @meta
{
  "name": "xiaohongshu/note",
  "description": "获取小红书笔记详情（标题、正文、互动数据）",
  "domain": "www.xiaohongshu.com",
  "args": {
    "note_id": {"required": true, "description": "Note ID or full URL (with xsec_token)"},
    "xsec_token": {"required": false, "description": "Security token (from search/feed results). Required if note_id is bare ID."}
  },
  "capabilities": ["network"],
  "readOnly": true,
  "example": "bb-browser site xiaohongshu/note https://www.xiaohongshu.com/explore/69cef40b000000002103b5bc?xsec_token=AB367..."
}
*/

async function(args) {
  if (!args.note_id) return {error: 'Missing argument: note_id'};

  var noteId = args.note_id;
  var xsecToken = args.xsec_token || '';

  // Extract note_id and xsec_token from full URL
  var urlMatch = noteId.match(/explore\/([a-f0-9]+)/);
  if (urlMatch) {
    noteId = urlMatch[1];
    if (!xsecToken) {
      var tokenMatch = args.note_id.match(/xsec_token=([^&]+)/);
      if (tokenMatch) xsecToken = decodeURIComponent(tokenMatch[1]);
    }
  }

  var app = document.querySelector('#app')?.__vue_app__;
  var pinia = app?.config?.globalProperties?.$pinia;
  if (!pinia?._s) return {error: 'Page not ready', hint: 'Ensure xiaohongshu.com is fully loaded'};

  var userStore = pinia._s.get('user');
  if (!userStore?.loggedIn) return {error: 'Not logged in', hint: 'Run: bb-browser open https://www.xiaohongshu.com/explore — then log in manually'};

  var router = app.config.globalProperties.$router;
  var noteStore = pinia._s.get('note');
  if (!noteStore) return {error: 'Note store not found'};

  // Navigate to note page via SPA router (with xsec_token if available)
  var query = xsecToken ? {xsec_token: xsecToken, xsec_source: ''} : {};
  await router.push({path: '/explore/' + noteId, query: query});

  // Wait for noteDetailMap to populate
  // Vue reactive proxies need for...in to detect properties
  for (var i = 0; i < 15; i++) {
    var detail = noteStore.noteDetailMap[noteId];
    if (detail?.note) {
      for (var _k in detail.note) { break; }
      if (_k) break;
    }
    await new Promise(function(r) { setTimeout(r, 500); });
  }

  var detail = noteStore.noteDetailMap[noteId];
  if (!detail?.note) return {error: 'Note fetch failed', hint: xsecToken ? 'Note may be deleted' : 'Try providing xsec_token (from search/feed results)'};

  // Read from Vue reactive proxy — for...in needed because Object.keys returns [] on Proxy
  var n = detail.note;
  var result = {note_id: noteId, url: 'https://www.xiaohongshu.com/explore/' + noteId};
  for (var k in n) {
    switch (k) {
      case 'title': result.title = n[k]; break;
      case 'desc': result.desc = n[k]; break;
      case 'type': result.type = n[k]; break;
      case 'time': result.created_time = n[k]; break;
      case 'ipLocation': result.ip_location = n[k]; break;
      case 'user': result.author = n[k].nickname; result.author_id = n[k].userId; break;
      case 'interactInfo':
        result.likes = n[k].likedCount; result.comments = n[k].commentCount;
        result.collects = n[k].collectedCount; result.shares = n[k].shareCount; break;
      case 'tagList':
        result.tags = []; for (var t of n[k]) result.tags.push(t.name); break;
      case 'imageList':
        result.images = []; for (var img of n[k]) result.images.push(img.infoList?.[0]?.url || img.urlDefault); break;
    }
  }
  return result;
}
