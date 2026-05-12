/* @meta
{
  "name": "instagram/search",
  "description": "搜索用户/标签 (user search: username, full_name, pk, is_verified, profile_pic_url)",
  "domain": "www.instagram.com",
  "args": {
    "query": {"required": true, "description": "搜索关键词"}
  },
  "capabilities": ["network"],
  "readOnly": true,
  "example": "bb-browser site instagram/search \"UI design\""
}
*/

async function(args) {
  if (!args.query) return {error: 'Missing argument: query', hint: '请提供搜索关键词'};

  var csrftoken = document.cookie.split(';').map(function(c){return c.trim()}).find(function(c){return c.startsWith('csrftoken=')});
  if (!csrftoken) return {error: 'Not logged in', hint: '请先在浏览器中登录 Instagram', action: 'bb-browser open https://www.instagram.com/accounts/login/'};
  csrftoken = csrftoken.split('=')[1];

  var docId;
  var queryName = 'PolarisSearchBoxRefetchableQuery';
  var suffixes = ['', '.graphql'];
  for (var i = 0; i < suffixes.length; i++) {
    try {
      var mod = require(queryName + suffixes[i]);
      if (mod && mod.params && mod.params.id) { docId = mod.params.id; break; }
    } catch(e) {}
  }
  if (!docId) return {error: 'Query module not found: ' + queryName, hint: '刷新页面后重试'};

  var variables = {
    data: {
      context: 'blended',
      include_reel: 'true',
      query: args.query,
      rank_token: '',
      search_session_id: crypto.randomUUID(),
      search_surface: 'web_top_search'
    },
    hasQuery: true
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

  if (!resp.ok) return {error: 'HTTP ' + resp.status, hint: '请求失败，可能需要重新登录'};

  var d = await resp.json();
  var conn = d.data && d.data.xdt_api__v1__fbsearch__topsearch_connection;
  if (!conn) return {error: 'Unexpected response', hint: '响应格式异常，刷新页面后重试'};

  var users = (conn.users || []).map(function(u) {
    var user = u.user || u;
    return {
      pk: user.pk || user.pk_id,
      username: user.username,
      full_name: user.full_name,
      is_verified: user.is_verified || false,
      is_private: user.is_private || false,
      profile_pic_url: user.profile_pic_url || null
    };
  });

  var hashtags = (conn.hashtags || []).map(function(h) {
    var tag = h.hashtag || h;
    return {
      name: tag.name,
      media_count: tag.media_count || null
    };
  });

  return {
    query: args.query,
    user_count: users.length,
    users: users,
    hashtag_count: hashtags.length,
    hashtags: hashtags
  };
}
