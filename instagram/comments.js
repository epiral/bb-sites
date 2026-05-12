/* @meta
{
  "name": "instagram/comments",
  "description": "获取帖子评论 (post comments: content, author, like_count, created_at)",
  "domain": "www.instagram.com",
  "args": {
    "pk": {"required": true, "description": "帖子 pk ID（从 user-posts 结果获取）"}
  },
  "capabilities": ["network"],
  "readOnly": true,
  "example": "bb-browser site instagram/comments 3891044838099909701"
}
*/

async function(args) {
  if (!args.pk) return {error: 'Missing argument: pk', hint: '请提供帖子 pk ID'};

  var csrftoken = document.cookie.split(';').map(function(c){return c.trim()}).find(function(c){return c.startsWith('csrftoken=')});
  if (!csrftoken) return {error: 'Not logged in', hint: '请先在浏览器中登录 Instagram', action: 'bb-browser open https://www.instagram.com/accounts/login/'};
  csrftoken = csrftoken.split('=')[1];

  var resp = await fetch('/api/v1/media/' + args.pk + '/comments/?can_support_threading=true&permalink_enabled=false', {
    credentials: 'include',
    headers: {
      'X-CSRFToken': csrftoken,
      'X-IG-App-ID': '936619743392459',
      'X-Requested-With': 'XMLHttpRequest'
    }
  });

  if (!resp.ok) return {error: 'HTTP ' + resp.status, hint: '帖子不存在或评论已关闭'};

  var d = await resp.json();
  var comments = (d.comments || []).map(function(c) {
    var userInfo = c.user || {};
    return {
      id: c.pk,
      content: c.text || '',
      author: userInfo.username || '',
      author_pk: userInfo.pk || null,
      like_count: c.comment_like_count || 0,
      reply_count: c.child_comment_count || 0,
      created_at: c.created_at_utc || c.created_at || null
    };
  });

  return {
    pk: args.pk,
    comment_count: d.comment_count || comments.length,
    count: comments.length,
    comments: comments,
    has_more: d.has_more_comments || false
  };
}
