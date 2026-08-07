/* @meta
{
  "name": "tiktok/trending",
  "description": "Get TikTok trending videos (For You feed)",
  "domain": "www.tiktok.com",
  "args": {
    "count": {"required": false, "description": "Number of videos to return (default 20, max 30)"}
  },
  "capabilities": ["network"],
  "readOnly": true,
  "example": "bb-browser site tiktok/trending"
}
*/

async function(args) {
  const count = Math.min(parseInt(args.count) || 20, 30);

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
    is_page_visible: 'true',
    os: 'linux',
    region: 'US',
    screen_height: '1080',
    screen_width: '1920',
    tz_name: 'America/New_York',
    webcast_language: 'en'
  });

  const resp = await fetch('/api/trending/feed/?' + params.toString(), {
    credentials: 'include',
    headers: {'Accept': 'application/json, text/plain, */*'}
  });

  if (!resp.ok) return {error: 'HTTP ' + resp.status, hint: 'API error'};
  const data = await resp.json();

  if (data.status_code !== 0 && data.statusCode !== 0) {
    return {error: 'API status ' + (data.status_code || data.statusCode), msg: data.status_msg || ''};
  }

  const items = (data.awemeList || []).map(aweme => {
    const author = aweme.author || {};
    const stats = aweme.stats || {};
    const music = aweme.music || {};
    const video = aweme.video || {};
    return {
      id: aweme.aweme_id,
      desc: aweme.desc || '',
      author: {
        id: author.id,
        uniqueId: author.uniqueId,
        nickname: author.nickname
      },
      stats: {
        views: stats.playCount,
        likes: stats.diggCount,
        comments: stats.commentCount,
        shares: stats.shareCount
      },
      duration: video.duration,
      createTime: aweme.createTime ? new Date(aweme.createTime * 1000).toISOString() : null,
      music: music.title ? { title: music.title, author: music.authorName } : null,
      hashtags: (aweme.textExtra || []).filter(t => t.hashtagName).map(t => '#' + t.hashtagName),
      url: 'https://www.tiktok.com/@' + author.uniqueId + '/video/' + aweme.aweme_id
    };
  });

  return {
    count: items.length,
    items
  };
}
