/* @meta
{
  "name": "instagram/follow",
  "description": "关注用户 (follow user)",
  "domain": "www.instagram.com",
  "args": {
    "user_id": {"required": true, "description": "用户 pk ID"}
  },
  "capabilities": ["network"],
  "readOnly": false,
  "example": "bb-browser site instagram/follow 22326145"
}
*/

async function(args) {
  if (!args.user_id) return {error: 'Missing argument: user_id', hint: '请提供用户 pk ID'};

  var csrfMatch = document.cookie.match(/csrftoken=([^;]+)/);
  if (!csrfMatch) return {error: 'Not logged in', hint: '请先登录 Instagram', action: 'bb-browser open https://www.instagram.com/accounts/login/'};

  var resp = await fetch('/api/v1/friendships/create/' + args.user_id + '/', {
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

  if (!resp.ok) return {error: 'HTTP ' + resp.status, hint: '关注失败'};
  var d = await resp.json();
  return {user_id: args.user_id, status: d.status, friendship_status: d.friendship_status || null, result: d.result || null};
}
