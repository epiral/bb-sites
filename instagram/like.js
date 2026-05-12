/* @meta
{
  "name": "instagram/like",
  "description": "点赞帖子 (like post)",
  "domain": "www.instagram.com",
  "args": {
    "pk": {"required": true, "description": "帖子 pk ID"}
  },
  "capabilities": ["network"],
  "readOnly": false,
  "example": "bb-browser site instagram/like 3891044838099909701"
}
*/

async function(args) {
  if (!args.pk) return {error: 'Missing argument: pk', hint: '请提供帖子 pk ID'};

  var csrfMatch = document.cookie.match(/csrftoken=([^;]+)/);
  if (!csrfMatch) return {error: 'Not logged in', hint: '请先登录 Instagram', action: 'bb-browser open https://www.instagram.com/accounts/login/'};

  var resp = await fetch('/api/v1/web/likes/' + args.pk + '/like/', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-CSRFToken': csrfMatch[1],
      'X-IG-App-ID': '936619743392459',
      'X-Requested-With': 'XMLHttpRequest'
    },
    body: ''
  });

  if (!resp.ok) return {error: 'HTTP ' + resp.status, hint: '点赞失败'};
  var d = await resp.json();
  return {pk: args.pk, status: d.status};
}
