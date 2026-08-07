/* @meta
{
  "name": "tiktok/search",
  "description": "Search TikTok videos and users",
  "domain": "www.tiktok.com",
  "args": {
    "query": {"required": true, "description": "Search query"},
    "count": {"required": false, "description": "Number of results (default 20, max 100)"}
  },
  "capabilities": ["network"],
  "readOnly": true,
  "example": "bb-browser site tiktok/search \"AI agent\""
}
*/

async function(args) {
  if (!args.query) return {error: 'Missing argument: query', hint: 'Usage: bb-browser site tiktok/search "query"'};
  const count = Math.min(parseInt(args.count) || 20, 100);

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
    count: count.toString(),
    data_collection_enabled: 'false',
    device_id: '',
    device_platform: 'web_pc',
    focus_state: 'false',
    from_page: 'search',
    history_len: '3',
    is_fullscreen: 'false',
    is_page_visible: 'true',
    keyword: args.query,
    os: 'linux',
    region: 'US',
    screen_height: '1080',
    screen_width: '1920',
    tz_name: 'America/New_York',
    webcast_language: 'en',
    user_is_login: 'false'
  });

  const resp = await fetch('/api/search/general/full/?' + params.toString(), {
    credentials: 'include',
    headers: {'Accept': 'application/json, text/plain, */*'}
  });

  if (!resp.ok) return {error: 'HTTP ' + resp.status, hint: resp.status === 403 ? 'Rate limited or not logged in' : 'API error'};
  const data = await resp.json();

  if (data.status_code !== 0 && data.status_code !== undefined) {
    return {error: 'API status ' + data.status_code, msg: data.status_msg || ''};
  }

  const items = (data.data || []).map(item => {
    if (item.type === 1 && item.item) {
      const v = item.item;
      return {
        type: 'video',
        id: v.id,
        desc: v.desc,
        author: {
          id: v.author?.id,
          uniqueId: v.author?.uniqueId,
          nickname: v.author?.nickname,
          followers: v.authorStats?.followerCount
        },
        stats: {
          views: v.stats?.playCount,
          likes: v.stats?.diggCount,
          comments: v.stats?.commentCount,
          shares: v.stats?.shareCount
        },
        duration: v.video?.duration,
        createTime: v.createTime ? new Date(v.createTime * 1000).toISOString() : null,
        music: v.music?.title ? { title: v.music.title, author: v.music.authorName } : null,
        hashtags: (v.textExtra || []).filter(t => t.hashtagName).map(t => '#' + t.hashtagName),
        url: 'https://www.tiktok.com/@' + v.author?.uniqueId + '/video/' + v.id
      };
    }
    if (item.type === 2 && item.user) {
      const u = item.user;
      return {
        type: 'user',
        id: u.id,
        uniqueId: u.uniqueId,
        nickname: u.nickname,
        followers: u.stats?.followerCount,
        following: u.stats?.followingCount,
        likes: u.stats?.heartCount,
        videoCount: u.stats?.videoCount,
        verified: u.verified,
        description: u.signature || '',
        avatar: u.avatarThumb || '',
        url: 'https://www.tiktok.com/@' + u.uniqueId
      };
    }
    return null;
  }).filter(Boolean);

  return {
    query: args.query,
    count: items.length,
    items
  };
}
