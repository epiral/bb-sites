/* @meta
{
  "name": "instagram/thread",
  "description": "获取 DM 对话详情 (thread messages: text_body, sender, timestamp, content_type)",
  "domain": "www.instagram.com",
  "args": {
    "thread_id": {"required": true, "description": "线程 ID（从 messages 结果的 thread_key 获取）"}
  },
  "capabilities": ["network"],
  "readOnly": true,
  "example": "bb-browser site instagram/thread 114349499961298"
}
*/

async function(args) {
  if (!args.thread_id) return {error: 'Missing argument: thread_id', hint: '请提供线程 ID', action: 'bb-browser site instagram/messages'};

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
  ['IGDThreadDetailQuery', 'IGDThreadDetailQuery.graphql'].forEach(function(name) {
    try { var mod = require(name); if (mod && mod.params && mod.params.id && !docId) docId = mod.params.id; } catch(e) {}
  });
  if (!docId) docId = '28007469415578650';

  var variables = {
    thread_fbid: String(args.thread_id),
    min_uq_seq_id: null,
    __relay_internal__pv__IGDEnableOffMsysChatThemesQErelayprovider: false,
    __relay_internal__pv__IGDInitialMessagePageCountrelayprovider: 20,
    __relay_internal__pv__PolarisAIGMAccountLabelEnabledrelayprovider: false
  };

  var body = new URLSearchParams();
  body.append('__d', 'www');
  body.append('__user', '0');
  body.append('__a', '1');
  body.append('__comet_req', '7');
  body.append('fb_dtsg', fbDtsg);
  if (lsd) body.append('lsd', lsd);
  body.append('fb_api_caller_class', 'RelayModern');
  body.append('fb_api_req_friendly_name', 'IGDThreadDetailQuery');
  body.append('server_timestamps', 'true');
  body.append('variables', JSON.stringify(variables));
  body.append('doc_id', docId);

  var headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
    'X-CSRFToken': csrftoken,
    'X-IG-App-ID': '936619743392459',
    'X-Requested-With': 'XMLHttpRequest',
    'X-FB-Friendly-Name': 'IGDThreadDetailQuery'
  };
  if (lsd) headers['X-FB-LSD'] = lsd;

  var resp = await fetch('/api/graphql', {
    method: 'POST', credentials: 'include', headers: headers, body: body.toString()
  });

  if (!resp.ok) return {error: 'HTTP ' + resp.status, hint: '请求失败'};

  var d = await resp.json();
  var thread = d.data && d.data.get_slide_thread_nullable;
  if (!thread) return {error: 'Thread not found', hint: '对话不存在'};

  var t = thread.as_ig_direct_thread || thread;

  var users = (t.users || []).map(function(u) {
    return { pk: u.id, username: u.username, full_name: u.full_name, fbid: u.interop_messaging_user_fbid || null };
  });

  var senderMap = {};
  users.forEach(function(u) { if (u.fbid) senderMap[u.fbid] = u.username; });
  if (t.viewer && t.viewer.interop_messaging_user_fbid) {
    senderMap[t.viewer.interop_messaging_user_fbid] = t.viewer.username || '(me)';
  }

  var msgEdges = (t.slide_messages && t.slide_messages.edges) || [];
  var messages = msgEdges.map(function(e) {
    var m = e.node || {};
    var msg = {
      id: m.message_id || m.id,
      text: m.text_body || null,
      sender_fbid: m.sender_fbid,
      sender: (m.sender && m.sender.name) || senderMap[m.sender_fbid] || m.sender_fbid,
      timestamp_ms: m.timestamp_ms,
      content_type: m.content_type
    };

    // Parse media attachments (images, videos, etc.)
    var content = m.content || {};
    var attachments = content.attachments || [];
    if (attachments.length > 0) {
      msg.attachments = attachments.map(function(a) {
        return {
          type: a.__typename || null,
          url: a.attachment_cdn_url || a.preview_cdn_url || null,
          preview_url: a.preview_cdn_url || null,
          width: a.preview_width || null,
          height: a.preview_height || null
        };
      });
    }

    return msg;
  });

  return {
    thread_id: args.thread_id,
    title: t.thread_title || null,
    is_group: t.is_group || false,
    users: users,
    message_count: messages.length,
    messages: messages,
    has_more: t.slide_messages && t.slide_messages.page_info && t.slide_messages.page_info.has_next_page
  };
}
