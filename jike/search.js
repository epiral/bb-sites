/* @meta
{
  "name": "jike/search",
  "description": "即刻搜索动态",
  "domain": "web.okjike.com",
  "args": {
    "query": {"required": true, "description": "Search keyword"},
    "limit": {"required": false, "description": "Number of results (default 20)"}
  },
  "readOnly": true,
  "example": "bb-browser site jike/search \"AI agent\""
}
*/

async function(args) {
  if (!args.query) return {error: 'Missing argument: query'};
  const token = localStorage.getItem('JK_ACCESS_TOKEN');
  if (!token) return {error: 'Not logged in', hint: 'Please log in to https://web.okjike.com first.'};
  const _h = {'Content-Type': 'application/json', 'x-jike-access-token': token};
  const limit = parseInt(args.limit) || 20;
  const resp = await fetch('https://api.ruguoapp.com/1.0/search/integrate', {
    method: 'POST', headers: _h,
    body: JSON.stringify({keywords: args.query, type: 'ORIGINAL_POST', limit})
  });
  if (!resp.ok) return {error: 'HTTP ' + resp.status};
  const d = await resp.json();
  const items = Object.values(d.data || {});
  const posts = items.filter(i => i.type === 'ORIGINAL_POST').map(p => ({
    id: p.id, content: p.content, topic: p.topic?.content,
    author: p.user?.screenName, avatar: p.user?.avatarImage?.smallPicUrl,
    likes: p.likeCount, comments: p.commentCount, reposts: p.repostCount,
    createdAt: p.createdAt, pictures: (p.pictures || []).map(pic => pic.picUrl),
    url: 'https://web.okjike.com/post-detail/' + p.id + '/original'
  }));
  return {query: args.query, count: posts.length, posts};
}
