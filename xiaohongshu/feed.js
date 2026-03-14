/* @meta
{
  "name": "xiaohongshu/feed",
  "description": "获取小红书首页推荐 Feed",
  "domain": "www.xiaohongshu.com",
  "args": {
    "count": {"required": false, "description": "Number of notes (default: 20)"}
  },
  "capabilities": ["network"],
  "readOnly": true,
  "method": "A (签名 POST, 完整 headers)"
}
*/

async function(args) {
  // 方式 A: 自签名 + 完整 headers
  // homefeed POST 需要 X-s + X-t + X-S-Common + xy-direction
  let wpRequire;
  try { window.webpackChunkxhs_pc_web.push([['__xhs_feed__'], {}, (req) => { wpRequire = req; }]); } catch(e) {}

  const h = wpRequire(30251);
  if (!h?.Pu || !window.mnsv2) return {error: 'Signing module not found', hint: 'Page not fully loaded'};

  const num = parseInt(args.count) || 20;
  const apiPath = '/api/sns/web/v1/homefeed';
  const body = {
    cursor_score: '', num, refresh_type: 1, note_index: 0,
    unread_begin_note_id: '', unread_end_note_id: '', unread_note_count: 0,
    category: 'homefeed_recommend', search_key: '', need_num: num,
    image_formats: ['jpg','webp','avif'], need_filter_image: false
  };

  // 签名
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
          if (!r.success) { resolve({error: r.msg || 'code:' + r.code}); return; }
          const notes = (r.data.items || []).map(item => ({
            id: item.id, xsec_token: item.xsec_token,
            title: item.note_card?.display_title,
            type: item.note_card?.type,
            author: item.note_card?.user?.nickname,
            author_id: item.note_card?.user?.user_id,
            likes: item.note_card?.interact_info?.liked_count,
            cover: item.note_card?.cover?.info_list?.[0]?.url
          }));
          resolve({count: notes.length, has_more: !!r.data.cursor_score, notes});
        } catch { resolve({error: 'Parse error', status: xhr.status}); }
      }
    };
    xhr.send(JSON.stringify(body));
  });
}
