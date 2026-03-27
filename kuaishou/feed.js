/* @meta
{
  "name": "kuaishou/feed",
  "description": "Get the public Kuaishou recommended video feed",
  "domain": "www.kuaishou.com",
  "args": {
    "count": {"required": false, "description": "Number of results (default 10, max 20)"}
  },
  "capabilities": ["network"],
  "readOnly": true,
  "example": "bb-browser site kuaishou/feed 5"
}
*/

async function(args) {
  var limit = Math.min(Math.max(parseInt(args.count, 10) || 10, 1), 20);

  function decodeStateKey(text) {
    return String(text || '')
      .split('')
      .map(function(ch) { return String.fromCharCode(ch.charCodeAt(0) - 1); })
      .join('');
  }

  function clean(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
  }

  function pickCover(photo) {
    if (!photo) return undefined;
    if (photo.coverUrl) return photo.coverUrl;
    var urls = photo.coverUrls || photo.cover_urls || [];
    if (urls[0] && urls[0].url) return urls[0].url;
    return undefined;
  }

  function pickVideo(photo) {
    if (!photo) return undefined;

    var manifest = photo.manifestH265 || photo.manifest;
    var sets = manifest && manifest.adaptationSet;
    var reps = sets && sets[0] && sets[0].representation;
    if (reps && reps[0] && reps[0].url) return reps[0].url;

    var urls = photo.photoUrls || photo.photo_urls || [];
    if (urls[0] && urls[0].url) return urls[0].url;

    return undefined;
  }

  function mapFeed(item) {
    var photo = item.photo || {};
    var author = item.author || {};
    var tags = (item.tags || [])
      .map(function(tag) { return clean(tag && tag.name); })
      .filter(Boolean);
    var durationMs = Number(photo.duration) || 0;

    return {
      author: clean(author.name),
      author_id: author.id || undefined,
      author_url: author.id ? 'https://www.kuaishou.com/profile/' + author.id : undefined,
      avatar_url: author.headerUrl || undefined,
      caption: clean(photo.caption),
      tags: tags,
      likes: Number(photo.likeCount) || 0,
      views: Number(photo.viewCount) || 0,
      collects: Number(photo.collectCount) || 0,
      duration_ms: durationMs || undefined,
      duration_sec: durationMs ? Math.round(durationMs / 100) / 10 : undefined,
      cover_url: pickCover(photo),
      video_url: pickVideo(photo)
    };
  }

  if (location.hostname.indexOf('kuaishou.com') === -1 || location.pathname.indexOf('/new-reco') === -1) {
    return {
      error: 'Kuaishou recommended page required',
      hint: 'Switch the active browser tab to https://www.kuaishou.com/new-reco first, then run this adapter again.'
    };
  }

  var state = window.INIT_STATE || {};
  var data = null;

  Object.keys(state).some(function(key) {
    if (decodeStateKey(key) !== 'string-/rest/v/feed/hot,object-') return false;
    data = state[key];
    return true;
  });

  if ((!data || data.result !== 1 || !(data.feeds || []).length)) {
    var resp = await fetch('/rest/v/feed/hot', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: '{}'
    });

    if (!resp.ok) return { error: 'HTTP ' + resp.status, hint: 'Keep the active tab on https://www.kuaishou.com/new-reco and retry.' };
    data = await resp.json();
  }

  if (data.result !== 1) {
    return {
      error: 'Kuaishou feed request failed',
      code: data.result,
      captcha_url: data.url || data.error_url || undefined,
      hint: 'The public feed endpoint may require verification in this browser session.'
    };
  }

  var items = (data.feeds || []).map(mapFeed).filter(function(item) {
    return item.author || item.caption || item.video_url;
  });

  return {
    count: Math.min(items.length, limit),
    pcursor: data.pcursor || undefined,
    items: items.slice(0, limit)
  };
}
