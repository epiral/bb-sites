/* @meta
{
  "name": "xiaohongshu/user_posts",
  "description": "获取小红书用户的笔记列表",
  "domain": "www.xiaohongshu.com",
  "args": {
    "user_id": {"required": true, "description": "User ID"}
  },
  "capabilities": ["network"],
  "readOnly": true,
  "method": "A (签名 GET)",
  "example": "bb-browser site xiaohongshu/user_posts 5a927d8411be10720ae9e1e4"
}
*/

async function(args) {
  if (!args.user_id) return {error: 'Missing argument: user_id'};

  let wpRequire;
  try { window.webpackChunkxhs_pc_web.push([['__xhs_up__'], {}, (req) => { wpRequire = req; }]); } catch(e) {}

  const h = wpRequire(30251);
  if (!h?.Pu || !window.mnsv2) return {error: 'Signing module not found'};

  const apiPath = '/api/sns/web/v1/user_posted?num=30&cursor=&user_id=' + args.user_id + '&image_formats=jpg,webp,avif';

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
          if (!r.success) { resolve({error: r.msg || 'code:' + r.code}); return; }
          const notes = (r.data.notes || []).map(n => ({
            note_id: n.note_id,
            title: n.display_title,
            type: n.type,
            likes: n.interact_info?.liked_count,
            cover: n.cover?.info_list?.[0]?.url,
            time: n.last_update_time
          }));
          resolve({user_id: args.user_id, count: notes.length, has_more: r.data.has_more, cursor: r.data.cursor, notes});
        } catch { resolve({error: 'Parse error', status: xhr.status}); }
      }
    };
    xhr.send();
  });
}
