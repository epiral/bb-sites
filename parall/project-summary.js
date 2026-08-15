/* @meta
{
  "name": "parall/project-summary",
  "description": "读取指定组织的项目任务汇总",
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
  const path = '/orgs/' + encodeURIComponent(org.value) + '/projects/task-summary';
  const result = await parallGet(path);
  if (!result.ok) return result.result;
  const body = result.body && typeof result.body === 'object' ? result.body : {};
  return parallCarrier({org_id: org.value, ...body, observed_at: new Date().toISOString()}, {
    effective_args: {org_id: org.value},
    completeness: 'complete',
    reason: 'complete',
    source: {url: parallSafeSource(path)},
    pagination: {supported: false, returned: 1},
    auth: parallAuth(),
    warnings: parallWarnings()
  });
};
