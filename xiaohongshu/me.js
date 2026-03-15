/* @meta
{
  "name": "xiaohongshu/me",
  "description": "获取当前小红书登录用户信息",
  "domain": "www.xiaohongshu.com",
  "args": {},
  "capabilities": ["network"],
  "readOnly": true
}
*/

async function(args) {
  const app = document.querySelector('#app')?.__vue_app__;
  const pinia = app?.config?.globalProperties?.$pinia;
  if (!pinia?._s) return {error: 'Page not ready', hint: 'Ensure xiaohongshu.com is fully loaded'};

  const userStore = pinia._s.get('user');
  if (!userStore) return {error: 'No user store', hint: 'Page may not be fully loaded'};

  // 优先从 store 缓存读取（getUserInfo 有缓存时不会再发请求）
  if (!userStore.userInfo?.user_id) {
    if (userStore.getUserInfo) await userStore.getUserInfo();
    await new Promise(r => setTimeout(r, 500));
  }

  const u = userStore.userInfo;
  if (!u?.user_id) return {error: 'Failed to get user info', hint: 'Please log in to https://www.xiaohongshu.com in your browser first, then retry.'};
  return {nickname: u.nickname, red_id: u.red_id || u.redId, desc: u.desc, gender: u.gender, userid: u.user_id || u.userId, url: 'https://www.xiaohongshu.com/user/profile/' + (u.user_id || u.userId)};
}
