/* @meta
{
  "name": "parall/inbox",
  "description": "读取指定组织的通知收件箱",
  "domain": "app.parall.com",
  "args": {"org_id": {"required": true, "description": "Organization ID"}, "limit": {"required": false, "description": "Maximum 100"}, "cursor": {"required": false, "description": "Pagination cursor"}},
  "params": {"org_id": {"type": "string", "required": true, "description": "Organization ID from parall/orgs"}, "limit": {"type": "number", "required": false, "description": "Number of notifications (default 100, max 100)"}, "cursor": {"type": "string", "required": false, "description": "next_cursor from the previous response"}},
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
  const limit = parallLimit(args.limit, 100, 100);
  const cursor = args.cursor ? parallString(args.cursor) : null;
  const path = '/orgs/' + encodeURIComponent(org.value) + '/inbox?' + parallQuery([['limit', limit], ['cursor', cursor]]);
  const result = await parallGet(path);
  if (!result.ok) return result.result;
  return parallListResult({
    data: result.body?.data,
    body: result.body,
    orgId: org.value,
    itemsKey: 'items',
    args: {org_id: org.value, limit, cursor},
    path,
    limit
  });
};
