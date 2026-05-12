/* @meta
{
  "name": "instagram/messages",
  "description": "获取 DM 收件箱 (inbox threads: participants, last_message, timestamp)",
  "domain": "www.instagram.com",
  "args": {},
  "capabilities": ["network"],
  "readOnly": true,
  "example": "bb-browser site instagram/messages"
}
*/

async function(args) {
  var csrftoken = document.cookie.split(';').map(function(c){return c.trim()}).find(function(c){return c.startsWith('csrftoken=')});
  if (!csrftoken) return {error: 'Not logged in', hint: '请先在浏览器中登录 Instagram', action: 'bb-browser open https://www.instagram.com/accounts/login/'};
  csrftoken = csrftoken.split('=')[1];

  var fbDtsg = null;
  try { fbDtsg = require('DTSGInitialData').token; } catch(e) {}
  if (!fbDtsg) return {error: 'No fb_dtsg token', hint: '请刷新页面后重试', action: 'bb-browser refresh'};

  var lsd = null;
  try { lsd = require('LSD').token; } catch(e) {}
  if (!lsd) try { lsd = require('LSDToken').token; } catch(e) {}

  var docId;
  ['PolarisDirectInboxMobileQuery', 'PolarisDirectInboxQuery'].forEach(function(name) {
    ['', '.graphql'].forEach(function(suffix) {
      try { var mod = require(name + suffix); if (mod && mod.params && mod.params.id && !docId) docId = mod.params.id; } catch(e) {}
    });
  });
  if (!docId) return {error: 'Query module not loaded', hint: '请先打开 DM 页面', action: 'bb-browser open https://www.instagram.com/direct/inbox/'};

  var deviceId = localStorage.getItem('chatd-deviceid') || crypto.randomUUID();

  var variables = {
    device_id_for_iris_subscription: deviceId,
    __relay_internal__pv__IGDIsProfessionalAccountGKrelayprovider: false,
    __relay_internal__pv__IGDPinnedThreadsRenderEnabledGKrelayprovider: true,
    __relay_internal__pv__IGDMaxUnreadMessagesCountrelayprovider: 5,
    __relay_internal__pv__PolarisAIGMAccountLabelEnabledrelayprovider: false,
    __relay_internal__pv__IGDThreadListActionsEnabledGKrelayprovider: true
  };

  var body = new URLSearchParams();
  body.append('__d', 'www');
  body.append('__user', '0');
  body.append('__a', '1');
  body.append('__comet_req', '7');
  body.append('fb_dtsg', fbDtsg);
  if (lsd) body.append('lsd', lsd);
  body.append('fb_api_caller_class', 'RelayModern');
  body.append('fb_api_req_friendly_name', docId === '26472232189128878' ? 'PolarisDirectInboxQuery' : 'PolarisDirectInboxMobileQuery');
  body.append('server_timestamps', 'true');
  body.append('variables', JSON.stringify(variables));
  body.append('doc_id', docId);

  var headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
    'X-CSRFToken': csrftoken,
    'X-IG-App-ID': '936619743392459',
    'X-Requested-With': 'XMLHttpRequest'
  };
  if (lsd) headers['X-FB-LSD'] = lsd;

  var resp = await fetch('/api/graphql', {
    method: 'POST', credentials: 'include', headers: headers, body: body.toString()
  });

  if (!resp.ok) return {error: 'HTTP ' + resp.status, hint: '请求失败'};

  var d = await resp.json();
  var inbox = d.data && d.data.get_slide_mailbox_for_iris_subscription;
  if (!inbox || !inbox.threads_by_folder) return {error: 'Inbox empty or not available', hint: '没有 DM 消息或需要先打开 DM 页面'};

  var edges = inbox.threads_by_folder.edges || [];
  var threads = edges.map(function(e) {
    var wrapper = e.node || {};
    var t = wrapper.as_ig_direct_thread || wrapper;

    var users = (t.users || []).map(function(u) {
      return { pk: u.id, username: u.username, full_name: u.full_name };
    });

    var lastMsg = null;
    var msgEdges = (t.slide_messages && t.slide_messages.edges) || [];
    if (msgEdges.length > 0) {
      var m = msgEdges[0].node || {};
      lastMsg = { text: m.text_body || null, sender: m.sender && m.sender.name, timestamp_ms: m.timestamp_ms, content_type: m.content_type };
    }

    return {
      thread_key: t.thread_key,
      is_group: t.is_group || false,
      users: users,
      last_message: lastMsg,
      last_activity_ms: t.last_activity_timestamp_ms
    };
  });

  return { thread_count: threads.length, threads: threads };
}
