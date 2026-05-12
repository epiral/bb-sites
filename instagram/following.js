/* @meta
{
  "name": "instagram/following",
  "description": "获取用户的关注列表 (following: username, full_name, pk, is_verified)",
  "domain": "www.instagram.com",
  "args": {
    "user_id": {"required": true, "description": "用户 pk ID"},
    "count": {"required": false, "description": "获取数量，默认 20"}
  },
  "capabilities": ["network"],
  "readOnly": true,
  "example": "bb-browser site instagram/following 22326145"
}
*/

async function(args) {
  if (!args.user_id) return {error: 'Missing argument: user_id', hint: '请提供用户 pk ID'};

  var csrfMatch = document.cookie.match(/csrftoken=([^;]+)/);
  if (!csrfMatch) return {error: 'Not logged in', hint: '请先登录 Instagram', action: 'bb-browser open https://www.instagram.com/accounts/login/'};

  var count = parseInt(args.count) || 20;
  var resp = await fetch('/api/v1/friendships/' + args.user_id + '/following/?count=' + count, {
    credentials: 'include',
    headers: {
      'X-CSRFToken': csrfMatch[1],
      'X-IG-App-ID': '936619743392459',
      'X-Requested-With': 'XMLHttpRequest'
    }
  });

  if (!resp.ok) return {error: 'HTTP ' + resp.status, hint: '用户不存在或为私密账号'};

  var d = await resp.json();
  var users = (d.users || []).map(function(u) {
    return {pk: u.pk, username: u.username, full_name: u.full_name, is_verified: u.is_verified || false, is_private: u.is_private || false, profile_pic_url: u.profile_pic_url || null};
  });

  return {user_id: args.user_id, count: users.length, has_more: d.has_more || false, next_max_id: d.next_max_id || null, users: users};
}
