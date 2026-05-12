/* @meta
{
  "name": "instagram/comment",
  "description": "评论帖子 (add comment to post)",
  "domain": "www.instagram.com",
  "args": {
    "pk": {"required": true, "description": "帖子 pk ID"},
    "text": {"required": true, "description": "评论内容"}
  },
  "capabilities": ["network"],
  "readOnly": false,
  "example": "bb-browser site instagram/comment --pk 3891044838099909701 --text \"Great post!\""
}
*/

async function(args) {
  if (!args.pk) return {error: 'Missing argument: pk', hint: '请提供帖子 pk ID'};
  if (!args.text) return {error: 'Missing argument: text', hint: '请提供评论内容'};

  var csrfMatch = document.cookie.match(/csrftoken=([^;]+)/);
  if (!csrfMatch) return {error: 'Not logged in', hint: '请先登录 Instagram', action: 'bb-browser open https://www.instagram.com/accounts/login/'};

  var body = new URLSearchParams();
  body.append('comment_text', args.text);

  var resp = await fetch('/api/v1/web/comments/' + args.pk + '/add/', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-CSRFToken': csrfMatch[1],
      'X-IG-App-ID': '936619743392459',
      'X-Requested-With': 'XMLHttpRequest'
    },
    body: body.toString()
  });

  if (!resp.ok) return {error: 'HTTP ' + resp.status, hint: '评论失败，可能帖子已关闭评论'};
  var d = await resp.json();
  return {pk: args.pk, status: d.status, comment_id: d.pk || d.id || null, text: args.text};
}
