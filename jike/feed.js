/* @meta
{
  "name": "jike/feed",
  "description": "获取即刻推荐 Feed",
  "domain": "web.okjike.com",
  "args": {
    "limit": {"required": false, "description": "Number of posts (default 20)"}
  },
  "readOnly": true,
  "example": "bb-browser site jike/feed"
}
*/

async function(args) {
  const token = localStorage.getItem('JK_ACCESS_TOKEN');
  if (!token) return {error: 'Not logged in', hint: 'Please log in to https://web.okjike.com first.'};
  const _h = {'Content-Type': 'application/json', 'x-jike-access-token': token};
  const limit = parseInt(args.limit) || 20;
  const resp = await fetch('https://api.ruguoapp.com/1.0/recommendFeed/list', {
    method: 'POST', headers: _h,
    body: JSON.stringify({limit})
  });
  if (!resp.ok) return {error: 'HTTP ' + resp.status};
  const d = await resp.json();
  const items = d.data || [];
  const posts = items.filter(i => i.type === 'ORIGINAL_POST' || i.type === 'REPOST').map(p => ({
    id: p.id, type: p.type, content: p.content, topic: p.topic?.content,
    author: p.user?.screenName, likes: p.likeCount, comments: p.commentCount,
    createdAt: p.createdAt,
    url: 'https://web.okjike.com/post-detail/' + p.id + '/original'
  }));
  return {count: posts.length, posts};
}
