/* @meta
{
  "name": "parall/chats",
  "description": "读取指定组织的聊天与频道列表",
  "domain": "app.parall.com",
  "args": {"org_id": {"required": true, "description": "Organization ID"}, "limit": {"required": false, "description": "Maximum 200"}},
  "params": {"org_id": {"type": "string", "required": true, "description": "Organization ID from parall/orgs"}, "limit": {"type": "number", "required": false, "description": "Number of chats (default 200, max 200)"}},
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
  const limit = parallLimit(args.limit, 200, 200);
  const path = '/orgs/' + encodeURIComponent(org.value) + '/chats?' + parallQuery([['limit', limit]]);
  const result = await parallGet(path);
  if (!result.ok) return result.result;
  return parallListResult({
    data: result.body?.data,
    body: result.body,
    orgId: org.value,
    itemsKey: 'chats',
    args: {org_id: org.value, limit},
    path,
    limit
  });
};
