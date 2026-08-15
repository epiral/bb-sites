/* @meta
{
  "name": "parall/agents",
  "description": "读取指定组织的 Agent 列表",
  "domain": "app.parall.com",
  "args": {"org_id": {"required": true, "description": "Organization ID"}},
  "params": {"org_id": {"type": "string", "required": true, "description": "Organization ID from parall/orgs"}},
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
  const path = '/orgs/' + encodeURIComponent(org.value) + '/agents';
  const result = await parallGet(path);
  if (!result.ok) return result.result;
  return parallListResult({
    data: result.body?.data,
    body: result.body,
    orgId: org.value,
    itemsKey: 'agents',
    args: {org_id: org.value},
    path
  });
};
