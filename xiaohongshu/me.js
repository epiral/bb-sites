/* @meta
{
  "name": "xiaohongshu/me",
  "description": "获取当前小红书登录用户信息",
  "domain": "www.xiaohongshu.com",
  "args": {},
  "capabilities": ["network"],
  "readOnly": true,
  "method": "A (签名 GET, 不需要完整 interceptor)"
}
*/

async function(args) {
  // 方式 A: 简单 GET 接口，自己签名即可
  // user/me 是最宽松的接口，只需 X-s + X-t
  let wpRequire;
  try { window.webpackChunkxhs_pc_web.push([['__xhs_me__'], {}, (req) => { wpRequire = req; }]); } catch(e) {}

  const h = wpRequire(30251);
  if (!h?.Pu || !window.mnsv2) return {error: 'Signing module not found', hint: 'Page may not be fully loaded. Try refreshing.'};

  const apiPath = '/api/sns/web/v2/user/me';
  const c = h.Pu(apiPath);
  const s = h.Pu(apiPath);
  const d = window.mnsv2(apiPath, c, s);
  const xt = '' + Date.now();
  const xs = 'XYS_' + h.xE(h.lz(JSON.stringify({x0:'3',x1:'xhs-pc-web',x2:'PC',x3:d,x4:''})));

  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', 'https://edith.xiaohongshu.com' + apiPath, true);
    xhr.withCredentials = true;
    xhr.setRequestHeader('X-s', xs);
    xhr.setRequestHeader('X-t', xt);
    xhr.onreadystatechange = function() {
      if (xhr.readyState === 4) {
        try {
          const r = JSON.parse(xhr.responseText);
          if (!r.success) { resolve({error: r.msg || 'code:' + r.code, hint: 'Not logged in?'}); return; }
          resolve({nickname: r.data.nickname, red_id: r.data.red_id, desc: r.data.desc, gender: r.data.gender, userid: r.data.user_id});
        } catch { resolve({error: 'Parse error', status: xhr.status}); }
      }
    };
    xhr.send();
  });
}
