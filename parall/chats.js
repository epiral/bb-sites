/* @meta
{
  "name": "parall/chats",
  "description": "读取指定组织的聊天与频道列表",
  "domain": "app.parall.com",
  "args": {"org_id": {"required": true, "description": "Organization ID"}, "limit": {"required": false, "description": "Maximum 200"}, "cursor": {"required": false, "description": "Opaque pagination cursor"}, "scope": {"required": false, "description": "active, archived, or all"}},
  "params": {"org_id": {"type": "string", "required": true, "description": "Organization ID from parall/orgs"}, "limit": {"type": "number", "required": false, "description": "Number of chats (default 50, max 200)"}, "cursor": {"type": "string", "required": false, "description": "Opaque next_cursor from the previous response"}, "scope": {"type": "string", "required": false, "description": "Chat scope: active, archived, or all; default active"}},
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
  const limit = parallLimit(args.limit, 50, 200);
  const cursor = args.cursor ? parallString(args.cursor) : null;
  const scope = parallString(args.scope) || 'active';
  const path = '/orgs/' + encodeURIComponent(org.value) + '/chats?' + parallQuery([['limit', limit], ['cursor', cursor], ['scope', scope]]);
  const result = await parallGet(path);
  if (!result.ok) return result.result;
  return parallListResult({
    data: result.body?.data,
    body: result.body,
    orgId: org.value,
    itemsKey: 'chats',
    args: {org_id: org.value, limit, ...(cursor ? {cursor} : {}), scope},
    path,
    limit
  });
};
