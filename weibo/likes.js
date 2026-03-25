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
  let uid = args.uid;
  if (!uid) {
    const app = document.querySelector('#app');
    const store = app?.__vue_app__?.config?.globalProperties?.$store;
    const cfg = store?.state?.config?.config;
    uid = cfg?.uid;
    if (!uid) return {error: 'Not logged in', hint: 'Please log in to weibo.com first'};
  }

  const page = parseInt(args.page) || 1;
  const resp = await fetch('/ajax/statuses/likelist?uid=' + uid + '&page=' + page, {credentials: 'include'});
  if (!resp.ok) return {error: 'HTTP ' + resp.status, hint: 'Not logged in?'};
  const data = await resp.json();
  if (!data.ok) return {error: 'API error: ' + (data.msg || 'unknown'), hint: 'Not logged in?'};

  const strip = (html) => (html || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').trim();

  const list = (data.data?.list || []).map(s => {
    const item = {
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
        id: s.user?.id,
        screen_name: s.user?.screen_name,
        verified: s.user?.verified || false
      },
      url: 'https://weibo.com/' + (s.user?.id || '') + '/' + (s.mblogid || '')
    };

    if (s.retweeted_status) {
      const rt = s.retweeted_status;
      item.retweeted = {
        id: rt.idstr || String(rt.id),
        text: rt.text_raw || strip(rt.text || ''),
        user: rt.user?.screen_name || '[deleted]',
        likes_count: rt.attitudes_count || 0
      };
    }

    return item;
  });

  return {
    uid,
    page,
    count: list.length,
    posts: list
  };
}
