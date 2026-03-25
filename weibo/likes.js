/* @meta
{
  "name": "weibo/likes",
  "description": "Get posts liked by a Weibo user",
  "domain": "weibo.com",
  "args": {
    "uid": {"required": false, "description": "User ID (default: current logged-in user)"},
    "page": {"required": false, "description": "Page number (default: 1)"}
  },
  "capabilities": ["network"],
  "readOnly": true,
  "example": "bb-browser site weibo/likes"
}
*/

async function(args) {
  var uid = args.uid;
  if (!uid) {
    var app = document.querySelector('#app');
    var vue = app && app.__vue_app__;
    var store = vue && vue.config.globalProperties.$store;
    var cfg = store && store.state.config && store.state.config.config;
    uid = cfg && cfg.uid;
    if (!uid) return {error: 'Not logged in', hint: 'Please log in to weibo.com first'};
  }

  var page = parseInt(args.page) || 1;
  var resp = await fetch('/ajax/statuses/likelist?uid=' + uid + '&page=' + page, {credentials: 'include'});
  if (!resp.ok) return {error: 'HTTP ' + resp.status, hint: 'Not logged in?'};
  var data = await resp.json();
  if (!data.ok) return {error: 'API error: ' + (data.msg || 'unknown')};

  var strip = function(html) {
    return (html || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').trim();
  };

  var list = (data.data && data.data.list || []).map(function(s) {
    var item = {
      id: s.idstr || String(s.id),
      mblogid: s.mblogid,
      text: s.text_raw || strip(s.text || ''),
      created_at: s.created_at,
      source: strip(s.source || ''),
      reposts_count: s.reposts_count || 0,
      comments_count: s.comments_count || 0,
      likes_count: s.attitudes_count || 0,
      is_long_text: !!s.isLongText,
      pic_count: s.pic_num || 0,
      user: {
        id: s.user && s.user.id,
        screen_name: s.user && s.user.screen_name,
        verified: s.user && s.user.verified || false
      },
      url: 'https://weibo.com/' + (s.user && s.user.id || '') + '/' + (s.mblogid || '')
    };

    if (s.retweeted_status) {
      var rt = s.retweeted_status;
      item.retweeted = {
        id: rt.idstr || String(rt.id),
        text: rt.text_raw || strip(rt.text || ''),
        user: rt.user && rt.user.screen_name || '[deleted]',
        likes_count: rt.attitudes_count || 0
      };
    }

    return item;
  });

  return {
    uid: uid,
    page: page,
    count: list.length,
    posts: list
  };
}
