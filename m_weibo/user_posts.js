/* @meta
{
  "name": "m_weibo/user_posts",
  "description": "Get a Weibo user's posts from mobile site",
  "domain": "m.weibo.cn",
  "args": {
    "uid": {"required": true, "description": "User ID (numeric)"},
    "page": {"required": false, "description": "Page number (default: 1)"}
  },
  "capabilities": ["network"],
  "readOnly": true,
  "example": "bb-browser site m_weibo/user_posts 1654184992"
}
*/

async function(args) {
  if (!args.uid) return {error: 'Missing argument: uid'};
  const page = parseInt(args.page) || 1;

  // Use the mobile API for user posts (timeline)
  const resp = await fetch('/api/container/getIndex?containerid=107603' + args.uid + '&page=' + page, {
    credentials: 'include',
    headers: {
      'MWeibo-Pwa': '1',
      'X-Requested-With': 'XMLHttpRequest'
    }
  });

  if (!resp.ok) return {error: 'HTTP ' + resp.status};
  const data = await resp.json();
  if (!data.ok) return {error: 'API error: ' + (data.msg || 'unknown')};

  const strip = (html) => (html || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').trim();

  const cards = data.data?.cards || [];
  const list = cards
    .filter(c => c.card_type === 9 && c.mblog)
    .map(c => {
      const s = c.mblog;
      const item = {
        id: s.id,
        mblogid: s.mblogid,
        text: strip(s.text || ''),
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
    uid: args.uid,
    page,
    count: list.length,
    posts: list
  };
}
