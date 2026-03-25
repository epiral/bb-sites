/* @meta
{
  "name": "m_weibo/search",
  "description": "Search Weibo posts (mobile site)",
  "domain": "m.weibo.cn",
  "args": {
    "q": {"required": true, "description": "Search query"},
    "page": {"required": false, "description": "Page number (default: 1)"}
  },
  "capabilities": ["network"],
  "readOnly": true,
  "example": "bb-browser site m_weibo/search apple"
}
*/

async function(args) {
  if (!args.q) return {error: 'Missing argument: q'};
  const page = parseInt(args.page) || 1;

  // Search API for mobile Weibo
  const resp = await fetch('/api/container/getIndex?containerid=' + encodeURIComponent('100103type=1&q=' + args.q) + '&page=' + page, {
    credentials: 'include',
    headers: {
      'MWeibo-Pwa': '1',
      'X-Requested-With': 'XMLHttpRequest'
    }
  });

  if (!resp.ok) return {error: 'HTTP ' + resp.status};
  const data = await resp.json();
  if (!data.ok) return {error: 'API error: ' + (data.msg || 'unknown')};

  // Find the card group containing the mblog (Weibo) list
  const cards = data.data?.cards || [];
  const list = [];
  
  const strip = (html) => (html || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').trim();

  for (const group of cards) {
    if (group.card_group) {
      for (const item of group.card_group) {
        if (item.mblog) {
          const s = item.mblog;
          list.push({
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
          });
        }
      }
    } else if (group.mblog) {
        const s = group.mblog;
          list.push({
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
          });
    }
  }

  return {
    q: args.q,
    page,
    count: list.length,
    posts: list
  };
}
