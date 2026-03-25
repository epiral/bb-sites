/* @meta
{
  "name": "m_weibo/user",
  "description": "Get Weibo user info (mobile site)",
  "domain": "m.weibo.cn",
  "args": {
    "uid": {"required": true, "description": "User ID (numeric)"}
  },
  "capabilities": ["network"],
  "readOnly": true,
  "example": "bb-browser site m_weibo/user 1654184992"
}
*/

async function(args) {
  if (!args.uid) return {error: 'Missing argument: uid'};

  // Use the mobile API for user profile
  const resp = await fetch('/api/container/getIndex?containerid=100505' + args.uid, {
    credentials: 'include',
    headers: {
      'MWeibo-Pwa': '1',
      'X-Requested-With': 'XMLHttpRequest'
    }
  });

  if (!resp.ok) return {error: 'HTTP ' + resp.status};
  const data = await resp.json();
  if (!data.ok) return {error: 'API error: ' + (data.msg || 'unknown')};

  const u = data.data?.userInfo;
  if (!u) return {error: 'User not found'};

  return {
    id: u.id,
    screen_name: u.screen_name,
    description: u.description || '',
    gender: u.gender === 'm' ? 'male' : u.gender === 'f' ? 'female' : 'unknown',
    followers_count: u.followers_count,
    following_count: u.follow_count,
    statuses_count: u.statuses_count,
    verified: u.verified || false,
    verified_reason: u.verified_reason || '',
    avatar: u.avatar_hd || u.profile_image_url || '',
    profile_url: 'https://m.weibo.cn/u/' + u.id,
    tabs: data.data?.tabsInfo?.tabs?.map(t => ({
      title: t.title,
      containerid: t.containerid
    }))
  };
}
