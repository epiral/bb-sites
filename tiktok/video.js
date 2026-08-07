/* @meta
{
  "name": "tiktok/video",
  "description": "Get TikTok video details by ID or URL",
  "domain": "www.tiktok.com",
  "args": {
    "id": {"required": true, "description": "Video ID (numeric) or full TikTok URL"}
  },
  "capabilities": ["network"],
  "readOnly": true,
  "example": "bb-browser site tiktok/video 7627654617731534088"
}
*/

async function(args) {
  if (!args.id) return {error: 'Missing argument: id', hint: 'Usage: bb-browser site tiktok/video "video_id_or_url"'};

  // Extract video ID from URL if full URL is provided
  let videoId = args.id;
  const urlMatch = args.id.match(/video\/(\d+)/);
  if (urlMatch) videoId = urlMatch[1];

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
    webcast_language: 'en'
  });

  const resp = await fetch('/api/aweme/detail/?aweme_id=' + videoId + '&' + params.toString(), {
    credentials: 'include',
    headers: {'Accept': 'application/json, text/plain, */*'}
  });

  if (!resp.ok) return {error: 'HTTP ' + resp.status};
  const raw = await resp.text();
  if (!raw) return {error: 'Empty response'};

  let data;
  try { data = JSON.parse(raw); } catch { return {error: 'Invalid JSON', body: raw.slice(0, 200)}; }

  if (data.status_code !== 0 && data.statusCode !== 0) {
    return {error: 'API status ' + (data.status_code || data.statusCode), msg: data.status_msg || data.statusMsg || ''};
  }

  const aweme = data.awemeDetail || {};
  const author = aweme.author || {};
  const stats = aweme.stats || {};
  const music = aweme.music || {};
  const video = aweme.video || {};

  return {
    id: aweme.aweme_id || aweme.id,
    desc: aweme.desc || '',
    author: {
      id: author.id,
      uniqueId: author.uniqueId,
      nickname: author.nickname,
      followers: author.stats?.followerCount
    },
    stats: {
      views: stats.playCount,
      likes: stats.diggCount,
      comments: stats.commentCount,
      shares: stats.shareCount,
      downloads: stats.downloadCount
    },
    duration: video.duration,
    createTime: aweme.createTime ? new Date(aweme.createTime * 1000).toISOString() : null,
    music: music.title ? { id: music.id, title: music.title, author: music.authorName, cover: music.coverThumb } : null,
    hashtags: (aweme.textExtra || []).filter(t => t.hashtagName).map(t => ({ name: t.hashtagName, id: t.hashtagId })),
    video: {
      width: video.width,
      height: video.height,
      ratio: video.ratio,
      cover: video.cover || video.thumb,
      playAddr: (video.playAddr?.urlList || [])[0] || ''
    },
    url: 'https://www.tiktok.com/@' + author.uniqueId + '/video/' + aweme.aweme_id
  };
}
