/* @meta
{
  "name": "bilibili/opus",
  "description": "获取 Bilibili 单篇图文动态的详细内容",
  "domain": "www.bilibili.com",
  "args": {
    "id": {"required": true, "description": "Opus ID (from URL: bilibili.com/opus/<id>)"}
  },
  "capabilities": ["network"],
  "readOnly": true,
  "example": "bb-browser site bilibili/opus 1135066969108643848"
}
*/

async function(args) {
  const id = args.id || args._positional?.[0];
  if (!id) return {error: 'Missing argument: id', hint: 'Usage: bilibili/opus <id>'};

  const resp = await fetch('https://api.bilibili.com/x/polymer/web-dynamic/v1/detail?id=' + encodeURIComponent(id) + '&timezone_offset=-480', {credentials: 'include'});
  if (!resp.ok) return {error: 'HTTP ' + resp.status};
  const d = await resp.json();
  if (d.code !== 0) return {error: d.message || 'API error ' + d.code, hint: d.code === 4101128 ? 'Opus not found' : 'Not logged in?'};

  const item = d.data?.item;
  if (!item) return {error: 'No data returned'};

  const author = item.modules?.module_author;
  const dynamic = item.modules?.module_dynamic;
  const stat = item.modules?.module_stat;

  const result = {
    id: item.id_str,
    type: item.type,
    url: 'https://www.bilibili.com/opus/' + item.id_str,
    author: author?.name,
    author_mid: author?.mid,
    author_face: author?.face,
    pub_time: author?.pub_ts ? new Date(author.pub_ts * 1000).toISOString() : null,
    text: dynamic?.desc?.text || null,
    stat: {
      comment: stat?.comment?.count,
      forward: stat?.forward?.count,
      like: stat?.like?.count
    }
  };

  // Draw/image type
  if (item.type === 'DYNAMIC_TYPE_DRAW' && dynamic?.major?.draw) {
    result.images = (dynamic.major.draw.items || []).map(img => ({
      src: img.src,
      width: img.width,
      height: img.height
    }));
  }

  // Article type - also fetch full article body
  if (item.type === 'DYNAMIC_TYPE_ARTICLE' && dynamic?.major?.article) {
    const art = dynamic.major.article;
    result.article = {id: art.id, title: art.title, covers: art.covers, url: 'https://www.bilibili.com/read/cv' + art.id};
    try {
      const artResp = await fetch('https://api.bilibili.com/x/article/view?id=' + art.id, {credentials: 'include'});
      const artData = await artResp.json();
      if (artData.code === 0 && artData.data) {
        const raw = artData.data.content || artData.data.readInfo?.content || '';
        // Strip HTML tags, keep text and image alts
        result.article.content = raw
          .replace(/<img[^>]*alt="([^"]*)"[^>]*>/gi, '[$1]')
          .replace(/<img[^>]*data-src="([^"]*)"[^>]*>/gi, '[图片: $1]')
          .replace(/<img[^>]*src="([^"]*)"[^>]*>/gi, '[图片: $1]')
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<\/p>/gi, '\n')
          .replace(/<\/h[1-6]>/gi, '\n')
          .replace(/<[^>]+>/g, '')
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/\n{3,}/g, '\n\n')
          .trim();
        result.article.stats = {
          view: artData.data.stats?.view,
          like: artData.data.stats?.like,
          favorite: artData.data.stats?.favorite,
          share: artData.data.stats?.share
        };
      }
    } catch(e) {}
  }

  // Opus rich text
  if (dynamic?.major?.opus) {
    const opus = dynamic.major.opus;
    result.title = opus.title || null;
    result.summary = opus.summary?.text || null;
    // Extract full rich text content
    if (opus.paragraphs) {
      result.content = opus.paragraphs.map(p => {
        if (p.text) return (p.text.nodes || []).map(n => n.word?.words || n.rich_text?.text || '').join('');
        if (p.pic) return '[图片: ' + (p.pic.url || '') + ']';
        return '';
      }).filter(Boolean);
    }
    if (opus.pics?.length) {
      result.images = opus.pics.map(p => ({src: p.url, width: p.width, height: p.height}));
    }
  }

  // Replies preview
  try {
    const oid = item.basic?.comment_id_str || id;
    const commentType = item.basic?.comment_type || 17;
    const rResp = await fetch('https://api.bilibili.com/x/v2/reply?oid=' + oid + '&type=' + commentType + '&pn=1&ps=5&sort=1', {credentials: 'include'});
    const rData = await rResp.json();
    if (rData.code === 0 && rData.data?.replies) {
      result.top_replies = rData.data.replies.slice(0, 5).map(r => ({
        user: r.member?.uname,
        content: r.content?.message,
        like: r.like,
        time: r.ctime ? new Date(r.ctime * 1000).toISOString() : null
      }));
    }
  } catch(e) {}

  return result;
}
