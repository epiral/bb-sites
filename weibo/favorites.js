/* @meta
{
  "name": "weibo/favorites",
  "description": "Get current user's favorited (bookmarked) Weibo posts",
  "domain": "weibo.com",
  "args": {
    "page": {"required": false, "description": "Page number (default: 1, use 'all' to fetch everything)"},
    "format": {"required": false, "description": "Output format: json (default) or md (markdown)"}
  },
  "capabilities": ["network"],
  "readOnly": true,
  "example": "bb-browser site weibo/favorites all md"
}
*/

async function(args) {
  const fetchAll = args.page === 'all';
  const format = args.format || 'json';
  const startPage = fetchAll ? 1 : (parseInt(args.page) || 1);

  const strip = (html) => (html || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').trim();

  const parsePost = (s) => {
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
  };

  // Fetch total count from tags API
  let total = null;
  if (fetchAll) {
    const tagResp = await fetch('/ajax/favorites/tags?page=1&is_show_total=1', {credentials: 'include'});
    if (tagResp.ok) {
      const tagData = await tagResp.json();
      total = tagData.fav_total_num ?? null;
    }
  }

  const allPosts = [];
  let page = startPage;
  const PAGE_SIZE = 16;
  const SAFETY_MAX = 1000;
  let maxPages;
  if (fetchAll) {
    maxPages = (typeof total === 'number' && total > 0)
      ? Math.min(SAFETY_MAX, Math.ceil(total / PAGE_SIZE))
      : SAFETY_MAX;
  } else {
    maxPages = 1;
  }

  for (let i = 0; i < maxPages; i++) {
    const resp = await fetch('/ajax/favorites/all_fav?page=' + page, {credentials: 'include'});
    if (!resp.ok) return {error: 'HTTP ' + resp.status, hint: 'Not logged in?'};
    const data = await resp.json();
    if (!data.ok) return {error: 'API error: ' + (data.msg || 'unknown'), hint: 'Not logged in?'};

    const items = Array.isArray(data.data) ? data.data : [];
    if (items.length === 0) break;

    for (const item of items) {
      allPosts.push(parsePost(item));
    }

    if (!fetchAll) break;
    page++;
  }

  if (format === 'md') {
    const lines = ['# Weibo Favorites', ''];
    if (total !== null) lines.push('Total: ' + total + ' | Fetched: ' + allPosts.length, '');
    else lines.push('Fetched: ' + allPosts.length, '');

    for (let k = 0; k < allPosts.length; k++) {
      const p = allPosts[k];
      lines.push('## ' + (k + 1) + '. ' + (p.user.screen_name || 'unknown'));
      lines.push('');
      lines.push('> ' + p.text.replace(/\n/g, '\n> '));
      lines.push('');
      if (p.retweeted) {
        lines.push('**Retweet @' + p.retweeted.user + ':** ' + p.retweeted.text.substring(0, 200));
        lines.push('');
      }
      lines.push('- Date: ' + p.created_at);
      lines.push('- Stats: ' + p.likes_count + ' likes, ' + p.comments_count + ' comments, ' + p.reposts_count + ' reposts');
      if (p.pic_count > 0) lines.push('- Pictures: ' + p.pic_count);
      lines.push('- Link: ' + p.url);
      lines.push('');
      lines.push('---');
      lines.push('');
    }

    return lines.join('\n');
  }

  const result = {
    page: fetchAll ? 'all' : startPage,
    count: allPosts.length,
    posts: allPosts
  };
  if (total !== null) result.total = total;
  return result;
}
