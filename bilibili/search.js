/* @meta
{
  "name": "bilibili/search",
  "description": "Search Bilibili videos by keyword",
  "domain": "www.bilibili.com",
  "args": {
    "keyword": {"required": true, "description": "Search keyword"},
    "page": {"required": false, "description": "Page number (default: 1)"},
    "count": {"required": false, "description": "Results per page (default: 20, max: 50)"},
    "order": {"required": false, "description": "Sort order: totalrank (default), click (views), pubdate (newest), dm (danmaku), stow (favorites)"}
  },
  "capabilities": ["network"],
  "readOnly": true,
  "example": "bb-browser site bilibili/search 编程"
}
*/

async function(args) {
  if (!args.keyword) return {error: 'Missing argument: keyword'};
  const page = parseInt(args.page) || 1;
  const ps = Math.min(parseInt(args.count) || 20, 50);
  const order = args.order || 'totalrank';
  const params = new URLSearchParams({search_type: 'video', keyword: args.keyword, page: String(page), page_size: String(ps), order});
  const resp = await fetch('https://api.bilibili.com/x/web-interface/wbi/search/type?' + params, {credentials: 'include'});
  if (!resp.ok) return {error: 'HTTP ' + resp.status, hint: 'Not logged in?'};
  const d = await resp.json();
  if (d.code !== 0) return {error: d.message || 'API error ' + d.code, hint: 'Not logged in?'};
  const stripHtml = s => (s || '').replace(/<[^>]*>/g, '');
  const videos = (d.data?.result || []).map(r => ({
    bvid: r.bvid,
    title: stripHtml(r.title),
    author: r.author,
    duration: r.duration,
    play: r.play,
    danmaku: r.danmaku,
    like: r.like,
    favorites: r.favorites,
    pub_date: r.pubdate ? new Date(r.pubdate * 1000).toISOString() : null,
    url: 'https://www.bilibili.com/video/' + r.bvid
  }));
  return {keyword: args.keyword, page, total: d.data?.numResults || 0, count: videos.length, videos};
}
