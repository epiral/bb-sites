/* @meta
{
  "name": "instagram/post",
  "description": "获取帖子详情 (post detail: caption, user, like_count, comment_count, taken_at, images)",
  "domain": "www.instagram.com",
  "args": {
    "pk": {"required": true, "description": "帖子 pk ID（从 user-posts 结果获取）"}
  },
  "capabilities": ["network"],
  "readOnly": true,
  "example": "bb-browser site instagram/post 3891044838099909701"
}
*/

async function(args) {
  if (!args.pk) return {error: 'Missing argument: pk', hint: '请提供帖子 pk ID'};

  var csrftoken = document.cookie.split(';').map(function(c){return c.trim()}).find(function(c){return c.startsWith('csrftoken=')});
  if (!csrftoken) return {error: 'Not logged in', hint: '请先在浏览器中登录 Instagram', action: 'bb-browser open https://www.instagram.com/accounts/login/'};
  csrftoken = csrftoken.split('=')[1];

  var resp = await fetch('/api/v1/media/' + args.pk + '/info/', {
    credentials: 'include',
    headers: {
      'X-CSRFToken': csrftoken,
      'X-IG-App-ID': '936619743392459',
      'X-Requested-With': 'XMLHttpRequest'
    }
  });

  if (!resp.ok) return {error: 'HTTP ' + resp.status, hint: '帖子不存在或已被删除'};

  var d = await resp.json();
  var items = d.items || [];
  if (items.length === 0) return {error: 'Post not found', hint: '帖子不存在'};

  var item = items[0];
  var user = item.user || {};
  var caption = item.caption || {};

  var images = [];
  if (item.carousel_media) {
    images = item.carousel_media.map(function(m) {
      var candidates = (m.image_versions2 || {}).candidates || [];
      return candidates.length > 0 ? candidates[0].url : null;
    }).filter(Boolean);
  } else {
    var candidates = (item.image_versions2 || {}).candidates || [];
    if (candidates.length > 0) images.push(candidates[0].url);
  }

  return {
    pk: item.pk,
    media_type: item.media_type,
    caption: caption.text || null,
    user: {
      pk: user.pk,
      username: user.username,
      full_name: user.full_name || null,
      is_verified: user.is_verified || false
    },
    like_count: item.like_count,
    comment_count: item.comment_count,
    taken_at: item.taken_at,
    image_count: images.length,
    images: images,
    url: item.code ? 'https://www.instagram.com/p/' + item.code + '/' : null
  };
}
