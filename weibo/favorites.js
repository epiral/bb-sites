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
  var fetchAll = args.page === 'all';
  var format = args.format || 'json';
  var startPage = fetchAll ? 1 : (parseInt(args.page) || 1);

  var strip = function(html) {
    return (html || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').trim();
  };

  var parsePost = function(s) {
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
  };

  // Fetch total count from tags API
  var total = null;
  if (fetchAll) {
    var tagResp = await fetch('/ajax/favorites/tags?page=1&is_show_total=1', {credentials: 'include'});
    if (tagResp.ok) {
      var tagData = await tagResp.json();
      total = tagData.fav_total_num || null;
    }
  }

  var allPosts = [];
  var page = startPage;
  var maxPages = fetchAll ? 100 : 1;

  for (var i = 0; i < maxPages; i++) {
    var resp = await fetch('/ajax/favorites/all_fav?page=' + page, {credentials: 'include'});
    if (!resp.ok) return {error: 'HTTP ' + resp.status, hint: 'Not logged in?'};
    var data = await resp.json();
    if (!data.ok) return {error: 'API error: ' + (data.msg || 'unknown'), hint: 'Not logged in?'};

    var items = Array.isArray(data.data) ? data.data : [];
    if (items.length === 0) break;

    for (var j = 0; j < items.length; j++) {
      allPosts.push(parsePost(items[j]));
    }

    if (!fetchAll) break;
    page++;
  }

  if (format === 'md') {
    var lines = ['# Weibo Favorites', ''];
    if (total !== null) lines.push('Total: ' + total + ' | Fetched: ' + allPosts.length, '');
    else lines.push('Fetched: ' + allPosts.length, '');

    for (var k = 0; k < allPosts.length; k++) {
      var p = allPosts[k];
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

  var result = {
    page: fetchAll ? 'all' : startPage,
    count: allPosts.length,
    posts: allPosts
  };
  if (total !== null) result.total = total;
  return result;
}
