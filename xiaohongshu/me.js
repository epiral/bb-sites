/* @meta
{
  "name": "xiaohongshu/me",
  "description": "获取当前小红书登录用户信息",
  "domain": "www.xiaohongshu.com",
  "args": {},
  "readOnly": true
}
*/

async function(args) {
  const app = document.querySelector('#app')?.__vue_app__;
  const pinia = app?.config?.globalProperties?.['$pinia'];
  if (!pinia?._s) return {error: 'Page not ready', hint: 'Ensure xiaohongshu.com is fully loaded'};

  const userStore = pinia._s.get('user');
  if (!userStore) return {error: 'User store not found'};
  if (!userStore.loggedIn) return {error: 'Not logged in', hint: 'Please log in to xiaohongshu.com first'};

  // userInfo is cached in the store after login
  let u = userStore.userInfo;

  // If not cached, try fetching
  if (!u || (!u.nickname && !u.userId)) {
    if (userStore.getUserInfo) {
      try { await userStore.getUserInfo(); } catch {}
      await new Promise(r => setTimeout(r, 500));
      u = userStore.userInfo;
    }
  }

  if (!u || (!u.nickname && !u.userId)) {
    return {error: 'Failed to get user info', hint: 'Try refreshing the page'};
  }

  return {
    nickname: u.nickname,
    red_id: u.redId || u.red_id,
    desc: u.desc,
    gender: u.gender,
    userid: u.userId || u.user_id,
    avatar: u.imageb || u.images,
    url: 'https://www.xiaohongshu.com/user/profile/' + (u.userId || u.user_id)
  };
}
