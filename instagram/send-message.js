/* @meta
{
  "name": "instagram/send-message",
  "description": "发送私信 (send DM text message). thread_id 支持: thread_v2_id, DM URL 里的 ID, 或用户 pk（自动创建对话）",
  "domain": "www.instagram.com",
  "args": {
    "text": {"required": true, "description": "消息内容"},
    "thread_id": {"required": true, "description": "对话 ID 或用户 pk ID"}
  },
  "capabilities": ["network"],
  "readOnly": false,
  "example": "bb-browser site instagram/send-message --text \"Hello!\" --thread_id 70223396376"
}
*/

async function(args) {
  if (!args.text) return {error: 'Missing argument: text', hint: '请提供消息内容'};
  if (!args.thread_id) return {error: 'Missing argument: thread_id', hint: '请提供对话 ID 或用户 pk ID'};

  var csrfMatch = document.cookie.match(/csrftoken=([^;]+)/);
  if (!csrfMatch) return {error: 'Not logged in', hint: '请先登录 Instagram', action: 'bb-browser open https://www.instagram.com/accounts/login/'};
  var csrf = csrfMatch[1];

  var fbDtsg = null;
  try { fbDtsg = require('DTSGInitialData').token; } catch(e) {}
  if (!fbDtsg) return {error: 'No fb_dtsg token', hint: '请刷新页面后重试', action: 'bb-browser refresh'};

  var lsd = null;
  try { lsd = require('LSD').token; } catch(e) {}
  if (!lsd) try { lsd = require('LSDToken').token; } catch(e) {}

  // Resolve thread_v2_id from whatever ID format was provided.
  // Step 1: Check inbox for matching thread_v2_id or user interop_fbid (URL ID)
  var threadIgid = null;
  var inputId = String(args.thread_id);

  var inboxResp = await fetch('/api/v1/direct_v2/inbox/?limit=20', {
    credentials: 'include',
    headers: {'X-CSRFToken': csrf, 'X-IG-App-ID': '936619743392459', 'X-Requested-With': 'XMLHttpRequest'}
  });
  if (inboxResp.ok) {
    var inboxData = await inboxResp.json();
    var threads = (inboxData.inbox && inboxData.inbox.threads) || [];
    for (var i = 0; i < threads.length; i++) {
      var t = threads[i];
      if (String(t.thread_v2_id) === inputId) { threadIgid = t.thread_v2_id; break; }
      var users = t.users || [];
      for (var j = 0; j < users.length; j++) {
        if (String(users[j].interop_messaging_user_fbid) === inputId) { threadIgid = t.thread_v2_id; break; }
      }
      if (threadIgid) break;
    }
  }

  // Step 2: If not found in inbox, treat as user pk → create thread
  if (!threadIgid) {
    var createBody = new URLSearchParams();
    createBody.append('recipient_users', JSON.stringify([inputId]));
    var createResp = await fetch('/api/v1/direct_v2/create_group_thread/', {
      method: 'POST', credentials: 'include',
      headers: {'Content-Type': 'application/x-www-form-urlencoded', 'X-CSRFToken': csrf, 'X-IG-App-ID': '936619743392459', 'X-Requested-With': 'XMLHttpRequest'},
      body: createBody.toString()
    });
    if (createResp.ok) {
      var createData = await createResp.json();
      threadIgid = createData.thread_v2_id;
    }
  }

  if (!threadIgid) return {error: 'Could not resolve thread', hint: '无法找到或创建对话'};

  // Send message via IGDirectTextSendMutation
  var docId;
  ['IGDirectTextSendMutation', 'IGDirectTextSendMutation.graphql'].forEach(function(name) {
    try { var mod = require(name); if (mod && mod.params && mod.params.id && !docId) docId = mod.params.id; } catch(e) {}
  });
  if (!docId) docId = '26911679871773184';

  var offlineId = String(Math.floor(Math.random() * 9000000000000000000) + 1000000000000000000);

  var variables = {
    ig_thread_igid: String(threadIgid),
    offline_threading_id: offlineId,
    recipient_igids: null,
    replied_to_client_context: null,
    replied_to_item_id: null,
    reply_to_message_id: null,
    sampled: null,
    text: {sensitive_string_value: args.text},
    mentions: [],
    mentioned_user_ids: [],
    commands: null,
    forwarded_from_thread_id: null,
    is_forwarded_from_own_message: null,
    send_attribution: 'igd_web_chat_tab:in_thread'
  };

  var body = new URLSearchParams();
  body.append('__d', 'www');
  body.append('__user', '0');
  body.append('__a', '1');
  body.append('__comet_req', '7');
  body.append('fb_dtsg', fbDtsg);
  if (lsd) body.append('lsd', lsd);
  body.append('fb_api_caller_class', 'RelayModern');
  body.append('fb_api_req_friendly_name', 'IGDirectTextSendMutation');
  body.append('server_timestamps', 'true');
  body.append('variables', JSON.stringify(variables));
  body.append('doc_id', docId);

  var headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
    'X-CSRFToken': csrf,
    'X-IG-App-ID': '1217981644879628',
    'X-Requested-With': 'XMLHttpRequest',
    'X-FB-Friendly-Name': 'IGDirectTextSendMutation'
  };
  if (lsd) headers['X-FB-LSD'] = lsd;

  var resp = await fetch('/api/graphql', {
    method: 'POST', credentials: 'include', headers: headers, body: body.toString()
  });

  if (!resp.ok) return {error: 'HTTP ' + resp.status, hint: '发送失败'};
  var d = await resp.json();

  if (d.errors && d.errors.length > 0) {
    return {error: d.errors[0].message || 'Send failed', detail: JSON.stringify(d.errors).substring(0, 300)};
  }

  return {
    status: 'ok',
    thread_id: threadIgid,
    text: args.text
  };
}
