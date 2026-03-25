/* @meta
{
  "name": "m_weibo/me",
  "description": "Get current logged-in Weibo user info (mobile site)",
  "domain": "m.weibo.cn",
  "args": {},
  "capabilities": ["network"],
  "readOnly": true,
  "example": "bb-browser site m_weibo/me"
}
*/

async function(args) {
  // Try config API first to get UID
  const resp = await fetch('/api/config', {
    credentials: 'include',
    headers: {
      'MWeibo-Pwa': '1',
      'X-Requested-With': 'XMLHttpRequest'
    }
  });

  if (!resp.ok) return {error: 'HTTP ' + resp.status};
  const data = await resp.json();
  if (!data.ok || !data.data?.login) return {error: 'Not logged in', hint: 'Please log in to m.weibo.cn first'};

  const uid = data.data.uid;
  if (!uid) return {error: 'UID not found in config', hint: 'Please log in to m.weibo.cn first'};

  // Now fetch the user profile using the UID
  const userResp = await fetch('/api/container/getIndex?containerid=100505' + uid, {
    credentials: 'include',
    headers: {
      'MWeibo-Pwa': '1',
      'X-Requested-With': 'XMLHttpRequest'
    }
  });

  if (!userResp.ok) return {error: 'HTTP ' + userResp.status + ' when fetching user info'};
  const userData = await userResp.json();
  if (!userData.ok) return {error: 'API error: ' + (userData.msg || 'unknown')};

  const u = userData.data?.userInfo;
  if (!u) return {error: 'User data not found for UID ' + uid};

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
    profile_url: 'https://m.weibo.cn/u/' + u.id
  };
}
