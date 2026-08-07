/* @meta
{
  "name": "tiktok/user",
  "description": "Get TikTok user profile info",
  "domain": "www.tiktok.com",
  "args": {
    "username": {"required": true, "description": "TikTok username (without @)"},
    "video_count": {"required": false, "description": "Number of recent videos to return (default 10, max 20)"}
  },
  "capabilities": ["network"],
  "readOnly": true,
  "example": "bb-browser site tiktok/user motoelite.vzla"
}
*/

async function(args) {
  if (!args.username) return {error: 'Missing argument: username', hint: 'Usage: bb-browser site tiktok/user "username"'};
  const videoCount = Math.min(parseInt(args.video_count) || 10, 20);
  const username = args.username.replace(/^@/, '');

  const params = new URLSearchParams({
    aid: '1988',
    app_language: 'en',
    app_name: 'tiktok_web',
    browser_language: 'en-US',
    browser_name: 'Mozilla',
    browser_online: 'true',
    browser_platform: 'Linux x86_64',
    browser_version: '5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
    channel: 'tiktok_web',
    cookie_enabled: 'true',
    data_collection_enabled: 'false',
    device_id: '',
    device_platform: 'web_pc',
    focus_state: 'false',
    history_len: '3',
    is_fullscreen: 'false',
    is_page_visible: 'true',
    os: 'linux',
    region: 'US',
    screen_height: '1080',
    screen_width: '1920',
    tz_name: 'America/New_York',
    uniqueId: username,
    user_is_login: 'false',
    webcast_language: 'en'
  });

  const resp = await fetch('/api/user/detail/?' + params.toString(), {
    credentials: 'include',
    headers: {'Accept': 'application/json, text/plain, */*'}
  });

  if (!resp.ok) return {error: 'HTTP ' + resp.status, hint: 'User not found or API error'};
  const raw = await resp.text();
  if (!raw) return {error: 'Empty response', hint: 'User may not exist or requires login'};

  let data;
  try { data = JSON.parse(raw); } catch { return {error: 'Invalid JSON', body: raw.slice(0, 200)}; }

  if (data.status_code !== 0 && data.statusCode !== 0) {
    return {error: 'API status ' + (data.status_code || data.statusCode), msg: data.status_msg || data.statusMsg || ''};
  }

  const user = data.userInfo?.user || {};
  const stats = data.userInfo?.stats || {};

  return {
    id: user.id,
    uniqueId: user.uniqueId,
    nickname: user.nickname,
    description: user.signature || '',
    followers: stats.followerCount,
    following: stats.followingCount,
    likes: stats.heartCount,
    videoCount: stats.videoCount,
    verified: user.verified || false,
    avatar: user.avatarThumb || '',
    url: 'https://www.tiktok.com/@' + user.uniqueId
  };
}
