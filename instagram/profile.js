/* @meta
{
  "name": "instagram/profile",
  "description": "获取用户资料 (user profile: biography, follower_count, following_count, media_count, is_verified, category)",
  "domain": "www.instagram.com",
  "args": {
    "user_id": {"required": true, "description": "用户 pk ID（从 search 结果获取）"}
  },
  "capabilities": ["network"],
  "readOnly": true,
  "example": "bb-browser site instagram/profile 22326145"
}
*/

async function(args) {
  if (!args.user_id) return {error: 'Missing argument: user_id', hint: '请提供用户 pk ID', action: 'bb-browser site instagram/search "关键词"'};

  var csrftoken = document.cookie.split(';').map(function(c){return c.trim()}).find(function(c){return c.startsWith('csrftoken=')});
  if (!csrftoken) return {error: 'Not logged in', hint: '请先在浏览器中登录 Instagram', action: 'bb-browser open https://www.instagram.com/accounts/login/'};
  csrftoken = csrftoken.split('=')[1];

  var docId;
  var queryName = 'PolarisProfilePageContentQuery';
  var suffixes = ['', '.graphql'];
  for (var i = 0; i < suffixes.length; i++) {
    try {
      var mod = require(queryName + suffixes[i]);
      if (mod && mod.params && mod.params.id) { docId = mod.params.id; break; }
    } catch(e) {}
  }
  if (!docId) return {error: 'Query module not found: ' + queryName, hint: '刷新页面后重试'};

  var variables = {
    id: String(args.user_id),
    enable_integrity_filters: true,
    __relay_internal__pv__PolarisCannesGuardianExperienceEnabledrelayprovider: true,
    __relay_internal__pv__PolarisCASB976ProfileEnabledrelayprovider: false,
    __relay_internal__pv__PolarisWebSchoolsEnabledrelayprovider: false,
    __relay_internal__pv__PolarisRepostsConsumptionEnabledrelayprovider: true
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
  var user = d.data && d.data.user;
  if (!user) return {error: 'User not found', hint: '用户不存在或已被封禁'};

  return {
    pk: user.pk || args.user_id,
    username: user.username,
    full_name: user.full_name,
    biography: user.biography || null,
    follower_count: user.follower_count,
    following_count: user.following_count,
    media_count: user.media_count,
    is_verified: user.is_verified || false,
    is_private: user.is_private || false,
    is_professional_account: user.is_professional_account || false,
    category: user.category || null,
    external_url: user.external_url || null,
    profile_pic_url: user.profile_pic_url || null,
    url: 'https://www.instagram.com/' + user.username + '/'
  };
}
