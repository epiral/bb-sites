/* @meta
{
  "name": "xiaohongshu/comments",
  "description": "获取小红书笔记的评论列表",
  "domain": "www.xiaohongshu.com",
  "args": {
    "note_id": {"required": true, "description": "Note ID"},
    "xsec_token": {"required": false, "description": "xsec_token (get from feed)"}
  },
  "capabilities": ["network"],
  "readOnly": true,
  "method": "A (签名 GET)",
  "example": "bb-browser site xiaohongshu/comments 69aa7160000000001b01634d"
}
*/

async function(args) {
  if (!args.note_id) return {error: 'Missing argument: note_id'};

  let wpRequire;
  try { window.webpackChunkxhs_pc_web.push([['__xhs_cmt__'], {}, (req) => { wpRequire = req; }]); } catch(e) {}

  const h = wpRequire(30251);
  if (!h?.Pu || !window.mnsv2) return {error: 'Signing module not found'};

  const xsecToken = args.xsec_token ? '&xsec_token=' + encodeURIComponent(args.xsec_token) + '&xsec_source=pc_feed' : '';
  const apiPath = '/api/sns/web/v2/comment/page?note_id=' + args.note_id + '&cursor=&top_comment_id=&image_formats=jpg,webp,avif' + xsecToken;

  const c = h.Pu(apiPath);
  const s = h.Pu(apiPath);
  const d = window.mnsv2(apiPath, c, s);
  const xt = '' + Date.now();
  const xs = 'XYS_' + h.xE(h.lz(JSON.stringify({x0:'3',x1:'xhs-pc-web',x2:'PC',x3:d,x4:''})));
  const commonData = {x0:'3',x1:'xhs-pc-web',x2:'PC',x3:xt,x4:apiPath,x5:h.Pu(''),x6:xt,x7:'',x8:'',x9:h.tb(xt+apiPath)};
  const xsc = h.xE(h.lz(JSON.stringify(commonData)));

  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', 'https://edith.xiaohongshu.com' + apiPath, true);
    xhr.withCredentials = true;
    xhr.setRequestHeader('Accept', 'application/json, text/plain, */*');
    xhr.setRequestHeader('Referer', 'https://www.xiaohongshu.com/');
    xhr.setRequestHeader('X-s', xs);
    xhr.setRequestHeader('X-t', xt);
    xhr.setRequestHeader('X-S-Common', xsc);
    xhr.setRequestHeader('xy-direction', '34');
    xhr.onreadystatechange = function() {
      if (xhr.readyState === 4) {
        try {
          const r = JSON.parse(xhr.responseText);
          if (!r.success) { resolve({error: r.msg || 'code:' + r.code, hint: 'May need xsec_token. Get from feed first.'}); return; }
          const comments = (r.data.comments || []).map(c => ({
            id: c.id,
            author: c.user_info?.nickname,
            author_id: c.user_info?.user_id,
            content: c.content,
            likes: c.like_count,
            sub_comment_count: c.sub_comment_count,
            created_time: c.create_time
          }));
          resolve({note_id: args.note_id, count: comments.length, has_more: r.data.has_more, comments});
        } catch { resolve({error: 'Parse error', status: xhr.status}); }
      }
    };
    xhr.send();
  });
}
