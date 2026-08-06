/* @meta
{
  "name": "xiaohongshu/get-trending-content",
  "description": "小红书热门内容 - 获取小红书推荐页热门短视频 (trending: title, author, likes, duration, url)",
  "domain": "www.xiaohongshu.com",
  "args": {},
  "readOnly": true,
  "example": "bb-browser site xiaohongshu/get-trending-content"
}
*/

async function(args) {
  const formatDuration = (seconds) => {
    if (!seconds || seconds <= 0) return '';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m + ':' + String(s).padStart(2, '0');
  };

  const extractFromSSR = (html) => {
    const startIdx = html.indexOf('window.__INITIAL_STATE__=');
    if (startIdx === -1) return null;
    const jsonStart = startIdx + 'window.__INITIAL_STATE__='.length;
    let depth = 0;
    let endIdx = jsonStart;
    for (let i = jsonStart; i < Math.min(html.length, jsonStart + 500000); i++) {
      const ch = html[i];
      if (ch === '{') depth++;
      else if (ch === '}') { depth--; if (depth === 0) { endIdx = i + 1; break; } }
    }
    if (depth !== 0) return null;
    // Replace JS undefined literals with JSON null before parsing
    let jsonStr = html.substring(jsonStart, endIdx);
    // Handle case-sensitive undefined, also handle trailing ; 
    jsonStr = jsonStr.replace(/:undefined\b/g, ':null');
    jsonStr = jsonStr.replace(/:undefined,/g, ':null,');
    jsonStr = jsonStr.replace(/:undefined}/g, ':null}');
    jsonStr = jsonStr.replace(/:undefined]/g, ':null]');
    jsonStr = jsonStr.replace(/,\s*undefined\b/g, ',null');
    jsonStr = jsonStr.replace(/\[undefined\]/g, '[null]');
    jsonStr = jsonStr.replace(/\[undefined,/g, '[null,');
    jsonStr = jsonStr.replace(/,undefined\]/g, ',null]');
    try {
      return JSON.parse(jsonStr);
    } catch (e) {
      return null;
    }
  };

  const url = 'https://www.xiaohongshu.com/explore';

  // Try fetching the page (SSR data is embedded in HTML)
  let resp;
  try {
    resp = await fetch(url, {credentials: 'include'});
  } catch (e) {
    return {error: '无法访问小红书探索页', detail: '请求失败: ' + (e.message || e), hint: '请检查网络或使用浏览器打开 https://www.xiaohongshu.com/explore'};
  }
  if (!resp.ok) {
    return {error: 'HTTP ' + resp.status, hint: '小红书可能暂时无法访问，请稍后重试'};
  }
  const html = await resp.text();
  if (!html || html.length < 1000) {
    return {error: '页面内容过短', hint: '小红书可能检测到爬虫，请使用浏览器模式重试'};
  }

  const state = extractFromSSR(html);
  if (!state) {
    return {error: '无法解析小红书初始数据', hint: '页面结构可能已更新，请检查 window.__INITIAL_STATE__'};
  }

  const feed = state.feed;
  if (!feed || !Array.isArray(feed.feeds) || feed.feeds.length === 0) {
    return {error: '探索页暂无推荐内容', detail: 'feeds 数据为空或缺失', hint: '小红书 SSR 数据中未找到推荐笔记列表'};
  }

  const posts = feed.feeds
    .filter(item => item && item.noteCard)
    .map(item => {
      const card = item.noteCard;
      const id = item.id || item.trackId || '';
      const title = card.displayTitle || card.title || '';
      const author = card.user?.nickname || card.user?.nickName || '';
      const likes = card.interactInfo?.likedCount || '';
      const type = card.type || 'normal';
      const duration = card.video?.capa?.duration || 0;

      return {
        title: title.trim(),
        author: author,
        likes: likes,
        type: type,
        duration: formatDuration(duration),
        duration_seconds: duration || null,
        url: id ? 'https://www.xiaohongshu.com/explore/' + id : '',
        id: id
      };
    })
    .filter(p => p.title || p.author);

  return {
    source: 'xiaohongshu_explore_ssr',
    count: posts.length,
    posts: posts
  };
}
