/* @meta
{
  "name": "instagram/user-posts",
  "description": "获取用户帖子列表 (user posts: pk, caption_preview, like_count, comment_count, taken_at, media_type)",
  "domain": "www.instagram.com",
  "args": {
    "username": {"required": true, "description": "用户名"},
    "count": {"required": false, "description": "获取数量，默认 12"}
  },
  "capabilities": ["network"],
  "readOnly": true,
  "example": "bb-browser site instagram/user-posts uidesignpatterns"
}
*/

async function(args) {
  if (!args.username) return {error: 'Missing argument: username', hint: '请提供用户名'};

  var csrftoken = document.cookie.split(';').map(function(c){return c.trim()}).find(function(c){return c.startsWith('csrftoken=')});
  if (!csrftoken) return {error: 'Not logged in', hint: '请先在浏览器中登录 Instagram', action: 'bb-browser open https://www.instagram.com/accounts/login/'};
  csrftoken = csrftoken.split('=')[1];

  var docId;
  var queryName = 'PolarisProfilePostsQuery';
  var suffixes = ['', '.graphql'];
  for (var i = 0; i < suffixes.length; i++) {
    try {
      var mod = require(queryName + suffixes[i]);
      if (mod && mod.params && mod.params.id) { docId = mod.params.id; break; }
    } catch(e) {}
  }
  if (!docId) return {error: 'Query module not found: ' + queryName, hint: '刷新页面后重试'};

  var count = parseInt(args.count) || 12;
  var variables = {
    data: {
      count: count,
      include_reel_media_seen_timestamp: true,
      include_relationship_info: true,
      latest_besties_reel_media: true,
      latest_reel_media: true
    },
    username: args.username,
    __relay_internal__pv__PolarisImmersiveFeedChainingEnabledrelayprovider: true,
    __relay_internal__pv__PolarisAIGMAccountLabelEnabledrelayprovider: false
  };

  var body = new URLSearchParams({
    doc_id: docId,
    variables: JSON.stringify(variables),
    fb_api_req_friendly_name: queryName
  });

  var resp = await fetch('/graphql/query', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-CSRFToken': csrftoken,
      'X-IG-App-ID': '936619743392459',
      'X-Requested-With': 'XMLHttpRequest'
    },
    body: body.toString()
  });

  if (!resp.ok) return {error: 'HTTP ' + resp.status, hint: '请求失败'};

  var d = await resp.json();
  var conn = d.data && d.data.xdt_api__v1__feed__user_timeline_graphql_connection;
  if (!conn) return {error: 'No posts data', hint: '该用户可能是私密账号或不存在'};

  var edges = conn.edges || [];
  var posts = edges.map(function(e) {
    var node = e.node || {};
    var caption = node.caption || {};
    var captionText = caption.text || '';
    return {
      pk: node.pk || node.id,
      media_type: node.media_type,
      caption_preview: captionText.length > 100 ? captionText.substring(0, 100) + '...' : captionText,
      like_count: node.like_count,
      comment_count: node.comment_count,
      taken_at: node.taken_at,
      url: node.code ? 'https://www.instagram.com/p/' + node.code + '/' : null
    };
  });

  var pageInfo = conn.page_info || {};

  return {
    username: args.username,
    count: posts.length,
    posts: posts,
    has_more: pageInfo.has_next_page || false
  };
}
