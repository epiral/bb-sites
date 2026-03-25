/* @meta
{
  "name": "m_weibo/feed",
  "description": "Get current logged-in Weibo user's friends feed (mobile site)",
  "domain": "m.weibo.cn",
  "args": {
    "page": {"required": false, "description": "Page number (default: 1)"}
  },
  "capabilities": ["network"],
  "readOnly": true,
  "example": "bb-browser site m_weibo/feed"
}
*/

async function(args) {
  const page = parseInt(args.page) || 1;

  // Use the mobile API for friends feed
  const resp = await fetch('/feed/friends?page=' + page, {
    credentials: 'include',
    headers: {
      'MWeibo-Pwa': '1',
      'X-Requested-With': 'XMLHttpRequest'
    }
  });

  if (!resp.ok) return {error: 'HTTP ' + resp.status, hint: 'Not logged in?'};
  const data = await resp.json();
  if (!data.ok) return {error: 'API error: ' + (data.msg || 'unknown'), hint: 'Not logged in?'};

  const strip = (html) => (html || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').trim();

  const list = (data.data?.statuses || []).map(s => {
    const item = {
      id: s.id,
      mblogid: s.mblogid,
      text: strip(s.text || ''),
      user: s.user?.screen_name || '[unknown]',
      uid: s.user?.id,
      created_at: s.created_at,
      source: strip(s.source || ''),
      reposts_count: s.reposts_count || 0,
      comments_count: s.comments_count || 0,
      likes_count: s.attitudes_count || 0,
      pic_count: s.pic_num || 0,
      url: 'https://m.weibo.cn/status/' + (s.id || '')
    };

    if (s.retweeted_status) {
      const rt = s.retweeted_status;
      item.retweeted = {
        id: rt.id,
        text: strip(rt.text || ''),
        user: rt.user?.screen_name || '[deleted]'
      };
    }

    return item;
  });

  return {
    page,
    count: list.length,
    posts: list
  };
}
