/* @meta
{
  "name": "tiktok/search",
  "description": "Search TikTok videos",
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
  if (!args.query) return {error: 'Missing argument: query', hint: 'Provide a search query'};

  const count = Math.min(parseInt(args.count) || 20, 100);

  // Build search parameters
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
    data_collection_enabled: 'true',
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

  try {
    const resp = await fetch('/api/search/general/full/?' + params.toString(), {
      credentials: 'include',
      headers: {
        'Accept': 'application/json, text/plain, */*'
      }
    });

    if (!resp.ok) {
      return {error: 'HTTP ' + resp.status, hint: 'API request failed. You may need to be logged in.'};
    }

    const data = await resp.json();

    if (data.status_code !== 0) {
      return {error: 'API returned status ' + data.status_code, hint: 'TikTok API error'};
    }

    if (!data.data || !Array.isArray(data.data)) {
      return {error: 'Unexpected response format', hint: 'API response structure may have changed'};
    }

    // Extract video information from results
    const videos = [];
    for (const item of data.data) {
      if (item.type !== 1 || !item.item) continue;

      const video = item.item;
      const stats = video.stats || {};
      const author = video.author || {};
      const music = video.music || {};

      videos.push({
        id: video.id,
        description: video.desc || '',
        url: 'https://www.tiktok.com/@' + (author.uniqueId || '') + '/video/' + video.id,
        createTime: video.createTime ? new Date(video.createTime * 1000).toISOString() : null,

        // Author info
        author: {
          id: author.id || '',
          username: author.uniqueId || '',
          displayName: author.nickname || '',
          avatar: author.avatarLarger || author.avatarMedium || author.avatarThumb || ''
        },

        // Video info
        video: {
          id: video.video?.id || video.id,
          duration: video.video?.duration || 0,
          width: video.video?.width || 0,
          height: video.video?.height || 0,
          ratio: video.video?.ratio || '',
          cover: video.video?.cover || video.video?.originCover || '',
          playUrl: video.video?.playAddr || ''
        },

        // Stats
        stats: {
          plays: stats.playCount || 0,
          likes: stats.diggCount || 0,
          comments: stats.commentCount || 0,
          shares: stats.shareCount || 0
        },

        // Music info
        music: {
          id: music.id || '',
          title: music.title || '',
          author: music.author || '',
          cover: music.coverLarge || music.coverMedium || music.coverThumb || ''
        },

        // Hashtags
        hashtags: (video.textExtra || []).map(tag => ({
          text: tag.hashtagName || '',
          type: tag.type || 0
        })).filter(h => h.text)
      });
    }

    return {
      query: args.query,
      count: videos.length,
      videos
    };

  } catch (error) {
    return {error: 'Request failed', hint: error.message};
  }
}
