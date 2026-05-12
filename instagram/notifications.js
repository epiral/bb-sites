/* @meta
{
  "name": "instagram/notifications",
  "description": "获取通知列表 (notifications: text, type, timestamp, profile_name)",
  "domain": "www.instagram.com",
  "args": {},
  "capabilities": ["network"],
  "readOnly": true,
  "example": "bb-browser site instagram/notifications"
}
*/

async function(args) {
  var csrftoken = document.cookie.split(';').map(function(c){return c.trim()}).find(function(c){return c.startsWith('csrftoken=')});
  if (!csrftoken) return {error: 'Not logged in', hint: '请先在浏览器中登录 Instagram', action: 'bb-browser open https://www.instagram.com/accounts/login/'};
  csrftoken = csrftoken.split('=')[1];

  var resp = await fetch('/api/v1/news/inbox/', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-CSRFToken': csrftoken,
      'X-IG-App-ID': '936619743392459',
      'X-Requested-With': 'XMLHttpRequest'
    },
    body: ''
  });

  if (!resp.ok) return {error: 'HTTP ' + resp.status, hint: '请求失败'};

  var d = await resp.json();
  var newStories = d.new_stories || [];
  var oldStories = d.old_stories || [];

  function mapStory(s) {
    var a = s.args || {};
    return {
      type: s.story_type,
      text: a.text || null,
      timestamp: a.timestamp,
      profile_name: a.profile_name || null,
      profile_id: a.profile_id || null,
      media_id: a.media && a.media[0] ? a.media[0].id : null
    };
  }

  return {
    counts: d.counts || {},
    new_count: newStories.length,
    old_count: oldStories.length,
    new_stories: newStories.map(mapStory),
    old_stories: oldStories.map(mapStory)
  };
}
