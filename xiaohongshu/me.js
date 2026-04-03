/* @meta
{
  "name": "xiaohongshu/me",
  "description": "获取当前小红书登录用户信息",
  "domain": "www.xiaohongshu.com",
  "args": {},
  "capabilities": [],
  "readOnly": true
}
*/

async function(args) {
  var app = document.querySelector('#app')?.__vue_app__;
  var pinia = app?.config?.globalProperties?.$pinia;
  if (!pinia?._s) return {error: 'Page not ready', hint: 'Ensure xiaohongshu.com is fully loaded'};

  var userStore = pinia._s.get('user');
  if (!userStore) return {error: 'User store not found'};

  if (!userStore.loggedIn) return {error: 'Not logged in', hint: 'Run: bb-browser open https://www.xiaohongshu.com/explore — then log in manually'};

  var u = userStore.userInfo;
  if (!u) {
    // Try fetching if not already loaded
    if (userStore.getUserInfo) await userStore.getUserInfo();
    u = userStore.userInfo;
  }

  if (!u) return {error: 'Failed to get user info', hint: 'User info failed to load'};

  return {
    nickname: u.nickname,
    red_id: u.red_id || u.redId,
    desc: u.desc,
    gender: u.gender,
    userid: u.user_id || u.userId,
    url: 'https://www.xiaohongshu.com/user/profile/' + (u.user_id || u.userId)
  };
}
