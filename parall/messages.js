/* @meta
{
  "name": "parall/messages",
  "description": "读取指定聊天的消息及分页状态",
  "domain": "app.parall.com",
  "args": {"org_id": {"required": true, "description": "Organization ID"}, "chat_id": {"required": true, "description": "Chat ID"}, "limit": {"required": false, "description": "Maximum 50"}, "cursor": {"required": false, "description": "Pagination cursor"}, "top_level": {"required": false, "description": "Only top-level messages (default true)"}},
  "params": {"org_id": {"type": "string", "required": true, "description": "Organization ID from parall/orgs"}, "chat_id": {"type": "string", "required": true, "description": "Chat ID from parall chats"}, "limit": {"type": "number", "required": false, "description": "Number of messages (default 50, max 50)"}, "cursor": {"type": "string", "required": false, "description": "next_cursor from the previous response"}, "top_level": {"type": "boolean", "required": false, "description": "Only top-level messages, default true"}},
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
  const limit = parallLimit(args.limit, 50, 50);
  const topLevel = parallBoolean(args.top_level, true);
  if (topLevel === null) return parallError('Invalid argument: top_level', 'Use true or false.', 'INVALID_ARGUMENT');
  const cursor = args.cursor ? parallString(args.cursor) : null;
  const path = '/orgs/' + encodeURIComponent(org.value) + '/chats/' + encodeURIComponent(chat.value) + '/messages?' + parallQuery([
    ['limit', limit],
    ['top_level', topLevel],
    ['cursor', cursor]
  ]);
  const result = await parallGet(path);
  if (!result.ok) return result.result;
  return parallListResult({
    data: result.body?.data,
    body: result.body,
    orgId: org.value,
    itemsKey: 'messages',
    args: {org_id: org.value, chat_id: chat.value, limit, cursor, top_level: topLevel},
    path,
    limit
  });
};
