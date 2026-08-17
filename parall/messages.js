/* @meta
{
  "name": "parall/messages",
  "description": "读取指定聊天的消息及分页状态",
  "domain": "app.parall.com",
  "args": {"org_id": {"required": true, "description": "Organization ID"}, "chat_id": {"required": true, "description": "Chat ID"}, "limit": {"required": false, "description": "Maximum 200"}, "cursor": {"required": false, "description": "Legacy before cursor"}, "before": {"required": false, "description": "Opaque before cursor"}, "after": {"required": false, "description": "Opaque after cursor"}, "thread_root_id": {"required": false, "description": "Thread root message ID"}, "since": {"required": false, "description": "Timestamp/date filter"}},
  "params": {"org_id": {"type": "string", "required": true, "description": "Organization ID from parall/orgs"}, "chat_id": {"type": "string", "required": true, "description": "Chat ID from parall chats"}, "limit": {"type": "number", "required": false, "description": "Number of messages (default 50, max 200)"}, "cursor": {"type": "string", "required": false, "description": "Legacy alias for before; opaque next_cursor"}, "before": {"type": "string", "required": false, "description": "Opaque before cursor; mutually exclusive with after"}, "after": {"type": "string", "required": false, "description": "Opaque after cursor; mutually exclusive with before/cursor"}, "thread_root_id": {"type": "string", "required": false, "description": "Optional thread root message ID"}, "since": {"type": "string", "required": false, "description": "Optional timestamp/date filter"}},
  "auth": "required",
  "profile": "required",
  "side_effect": "read_only",
  "retry_safety": "safe_with_backoff",
  "max_concurrency": 1,
  "serialization_key": "site:parall:{profile}",
  "output_modes": ["legacy", "envelope_v1"],
  "timeout_class": "standard",
  "envelope_versions": ["pinix.site-result-envelope.v1"],
  "readOnly": true
}
*/

module.exports = async function(args) {
  const org = parallOrgId(args);
  if (org.error) return org.error;
  const chat = parallResourceId(args.chat_id, 'cht_', 'chat_id');
  if (chat.error) return chat.error;
  const limit = parallLimit(args.limit, 50, 200);
  const cursor = args.cursor ? parallString(args.cursor) : null;
  const before = args.before ? parallString(args.before) : null;
  const after = args.after ? parallString(args.after) : null;
  if (before && (after || cursor)) return parallError('Invalid arguments: before and after/cursor are mutually exclusive.', 'Provide only one pagination direction.', 'INVALID_ARGUMENT');
  if (cursor && after) return parallError('Invalid arguments: cursor and after are mutually exclusive.', 'Use before or the legacy cursor with no after value.', 'INVALID_ARGUMENT');
  const threadRootId = args.thread_root_id ? parallString(args.thread_root_id) : null;
  const since = args.since ? parallString(args.since) : null;
  const path = '/orgs/' + encodeURIComponent(org.value) + '/chats/' + encodeURIComponent(chat.value) + '/messages?' + parallQuery([
    ['limit', limit],
    ['before', before || cursor],
    ['after', after],
    ['thread_root_id', threadRootId],
    ['since', since]
  ]);
  const result = await parallGet(path);
  if (!result.ok) return result.result;
  return parallListResult({
    data: result.body?.data,
    body: result.body,
    orgId: org.value,
    itemsKey: 'messages',
    args: {org_id: org.value, chat_id: chat.value, limit, ...(cursor ? {cursor} : {}), ...(before ? {before} : {}), ...(after ? {after} : {}), ...(threadRootId ? {thread_root_id: threadRootId} : {}), ...(since ? {since} : {})},
    path,
    limit
  });
};
