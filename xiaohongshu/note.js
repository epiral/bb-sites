/* @meta
{
  "name": "xiaohongshu/note",
  "description": "获取小红书笔记详情（标题、正文、互动数据）",
  "domain": "www.xiaohongshu.com",
  "args": {
    "note_id": {"required": true, "description": "Note ID or URL"},
    "xsec_token": {"required": false, "description": "xsec_token from feed/search (optional, auto-fetched if omitted)"}
  },
  "capabilities": ["network"],
  "readOnly": true,
  "method": "A (签名 POST with full headers)",
  "example": "bb-browser site xiaohongshu/note 69aa7160000000001b01634d"
}
*/

async function(args) {
  if (!args.note_id) return {error: 'Missing argument: note_id'};

  // 从 URL 提取 note_id
  let noteId = args.note_id;
  const urlMatch = noteId.match(/explore\/([a-f0-9]+)/);
  if (urlMatch) noteId = urlMatch[1];

  // 方式 A: 签名 POST
  let wpRequire;
  try { window.webpackChunkxhs_pc_web.push([['__xhs_note__'], {}, (req) => { wpRequire = req; }]); } catch(e) {}

  const h = wpRequire(30251);
  if (!h?.Pu || !window.mnsv2) return {error: 'Signing module not found'};

  const apiPath = '/api/sns/web/v1/feed';
  const body = {
    source_note_id: noteId,
    image_formats: ['jpg','webp','avif'],
    extra: {need_body_topic: 1},
    xsec_source: 'pc_feed',
    xsec_token: args.xsec_token || ''
  };

  const payload = apiPath + JSON.stringify(body);
  const c = h.Pu(payload);
  const s = h.Pu(apiPath);
  const d = window.mnsv2(payload, c, s);
  const xt = '' + Date.now();
  const xs = 'XYS_' + h.xE(h.lz(JSON.stringify({x0:'3',x1:'xhs-pc-web',x2:'PC',x3:d,x4:'object'})));
  const commonData = {x0:'3',x1:'xhs-pc-web',x2:'PC',x3:xt,x4:apiPath,x5:h.Pu(JSON.stringify(body)),x6:xt,x7:'',x8:'',x9:h.tb(xt+apiPath+JSON.stringify(body))};
  const xsc = h.xE(h.lz(JSON.stringify(commonData)));

  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', 'https://edith.xiaohongshu.com' + apiPath, true);
    xhr.withCredentials = true;
    xhr.setRequestHeader('Accept', 'application/json, text/plain, */*');
    xhr.setRequestHeader('Content-Type', 'application/json;charset=UTF-8');
    xhr.setRequestHeader('Referer', 'https://www.xiaohongshu.com/');
    xhr.setRequestHeader('X-s', xs);
    xhr.setRequestHeader('X-t', xt);
    xhr.setRequestHeader('X-S-Common', xsc);
    xhr.setRequestHeader('xy-direction', '34');
    xhr.onreadystatechange = function() {
      if (xhr.readyState === 4) {
        try {
          const r = JSON.parse(xhr.responseText);
          if (!r.success) { resolve({error: r.msg || 'code:' + r.code, hint: 'Note may require xsec_token. Get it from feed first: bb-browser site xiaohongshu/feed'}); return; }
          const note = r.data?.items?.[0]?.note_card;
          if (!note) { resolve({error: 'Note not found in response'}); return; }
          resolve({
            note_id: noteId,
            title: note.title,
            desc: note.desc,
            type: note.type,
            author: note.user?.nickname,
            author_id: note.user?.user_id,
            likes: note.interact_info?.liked_count,
            comments: note.interact_info?.comment_count,
            collects: note.interact_info?.collected_count,
            shares: note.interact_info?.share_count,
            tags: note.tag_list?.map(t => t.name),
            images: note.image_list?.map(img => img.info_list?.[0]?.url),
            created_time: note.time
          });
        } catch { resolve({error: 'Parse error', status: xhr.status}); }
      }
    };
    xhr.send(JSON.stringify(body));
  });
}
