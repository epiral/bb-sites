/* @meta
{
  "name": "bilibili/user-opus",
  "description": "获取指定用户的图文动态列表",
  "domain": "www.bilibili.com",
  "args": {
    "mid": {"required": true, "description": "用户 mid (从 space.bilibili.com/<mid> 获取)"},
    "count": {"required": false, "description": "返回数量 (default: 20, max: 50)"},
    "offset": {"required": false, "description": "分页偏移 (上一页返回的 offset)"}
  },
  "capabilities": ["network"],
  "readOnly": true,
  "example": "bb-browser site bilibili/user-opus 180229733"
}
*/

async function(args) {
  const mid = args.mid || args._positional?.[0];
  if (!mid) return {error: 'Missing argument: mid', hint: 'Usage: bilibili/user-opus <mid>'};
  const maxCount = Math.min(parseInt(args.count) || 20, 50);

  let url = 'https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/space?host_mid=' + encodeURIComponent(mid) + '&timezone_offset=-480';
  if (args.offset) url += '&offset=' + encodeURIComponent(args.offset);

  const resp = await fetch(url, {credentials: 'include'});
  if (!resp.ok) return {error: 'HTTP ' + resp.status};
  const d = await resp.json();
  if (d.code !== 0) return {error: d.message || 'API error ' + d.code, hint: 'Not logged in or user not found?'};
  if (!d.data?.items?.length) return {error: 'No items found', hint: 'User has no dynamics or not logged in'};

  // Filter for opus/draw/article types (图文)
  const opusTypes = ['DYNAMIC_TYPE_DRAW', 'DYNAMIC_TYPE_ARTICLE', 'DYNAMIC_TYPE_WORD'];
  const allItems = d.data.items || [];
  const filtered = allItems.filter(item => opusTypes.includes(item.type));

  const items = filtered.slice(0, maxCount).map(item => {
    const author = item.modules?.module_author;
    const dynamic = item.modules?.module_dynamic;
    const stat = item.modules?.module_stat;

    const result = {
      id: item.id_str,
      type: item.type,
      url: 'https://www.bilibili.com/opus/' + item.id_str,
      pub_time: author?.pub_ts ? new Date(author.pub_ts * 1000).toISOString() : null,
      text: dynamic?.desc?.text || null,
      comment_count: stat?.comment?.count,
      forward_count: stat?.forward?.count,
      like_count: stat?.like?.count
    };

    // Draw/image type
    if (item.type === 'DYNAMIC_TYPE_DRAW' && dynamic?.major?.draw) {
      result.image_count = (dynamic.major.draw.items || []).length;
      result.images = (dynamic.major.draw.items || []).map(img => img.src);
    }

    // Article type
    if (item.type === 'DYNAMIC_TYPE_ARTICLE' && dynamic?.major?.article) {
      const art = dynamic.major.article;
      result.article = {id: art.id, title: art.title, url: 'https://www.bilibili.com/read/cv' + art.id};
    }

    // Opus type (rich text)
    if (dynamic?.major?.opus) {
      const opus = dynamic.major.opus;
      result.title = opus.title || null;
      result.summary = opus.summary?.text || null;
      if (opus.pics?.length) {
        result.image_count = opus.pics.length;
        result.images = opus.pics.map(p => p.url);
      }
    }

    return result;
  });

  return {
    mid,
    count: items.length,
    total_in_page: allItems.length,
    has_more: !!d.data.has_more,
    offset: d.data.offset || null,
    items
  };
}
