/* @meta
{
  "name": "jike/following",
  "description": "获取即刻 Following Feed（关注流）",
  "domain": "web.okjike.com",
  "args": {
    "limit": {"required": false, "description": "Number of posts (default 20)"},
    "loadMoreKey": {"required": false, "description": "Pagination cursor if supported by API"},
    "debug": {"required": false, "description": "Return extra debug info (true/false)"}
  },
  "readOnly": true,
  "example": "bb-browser site jike/following"
}
*/

async function(args) {
  const token = localStorage.getItem('JK_ACCESS_TOKEN');
  if (!token) return {error: 'Not logged in', hint: 'Please log in to https://web.okjike.com first.'};

  const headers = {'Content-Type': 'application/json', 'x-jike-access-token': token};
  const limit = parseInt(args.limit) || 20;
  const debug = String(args.debug || '').toLowerCase() === 'true';

  const bodyBase = {limit};
  if (args.loadMoreKey) bodyBase.loadMoreKey = args.loadMoreKey;

  // Jike web has used multiple endpoints across versions. Try a few common ones for "following" feed.
  const candidates = [
    // Verified on https://web.okjike.com/following (captured via Network panel)
    'https://api.ruguoapp.com/1.0/personalUpdate/followingUpdates',
    'https://api.ruguoapp.com/1.0/followingFeed/list',
    'https://api.ruguoapp.com/1.0/followingUpdates/list',
    'https://api.ruguoapp.com/1.0/timeline/list'
  ];

  let lastErr = null;
  for (const url of candidates) {
    try {
      const resp = await fetch(url, {method: 'POST', headers, body: JSON.stringify(bodyBase)});
      if (!resp.ok) {
        lastErr = {url, status: resp.status};
        continue;
      }
      const json = await resp.json();
      const data = json?.data;
      const items =
        Array.isArray(data) ? data :
        Array.isArray(data?.items) ? data.items :
        Array.isArray(data?.data) ? data.data :
        Array.isArray(json?.data?.data) ? json.data.data :
        [];

      const loadMoreKey =
        json?.loadMoreKey ??
        data?.loadMoreKey ??
        json?.data?.loadMoreKey ??
        null;

      const posts = items
        .filter(i => i && (i.type === 'ORIGINAL_POST' || i.type === 'REPOST'))
        .map(p => ({
          id: p.id,
          type: p.type,
          content: p.content,
          topic: p.topic?.content,
          author: p.user?.screenName,
          avatar: p.user?.avatarImage?.smallPicUrl,
          likes: p.likeCount,
          comments: p.commentCount,
          reposts: p.repostCount,
          createdAt: p.createdAt,
          pictures: (p.pictures || []).map(pic => pic.picUrl),
          url: 'https://web.okjike.com/post-detail/' + p.id + '/original'
        }));

      const result = {count: posts.length, loadMoreKey, posts, endpoint: url};
      if (debug) result.raw = json;
      return result;
    } catch (e) {
      lastErr = {url, error: String(e && (e.message || e))};
    }
  }

  return {
    error: 'Failed to fetch following feed',
    hint: 'API endpoint may have changed; open DevTools on web.okjike.com and check the Network tab for the Following feed request.',
    tried: candidates,
    lastErr
  };
}
