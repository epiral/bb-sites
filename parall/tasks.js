/* @meta
{
  "name": "parall/tasks",
  "description": "读取指定组织的任务列表",
  "domain": "app.parall.com",
  "args": {"org_id": {"required": true, "description": "Organization ID"}, "assignee_id": {"required": false, "description": "Assignee ID"}, "parent_id": {"required": false, "description": "Parent task ID"}, "limit": {"required": false, "description": "Maximum 100"}, "sort": {"required": false, "description": "Sort field"}},
  "params": {
    "org_id": {"type": "string", "required": true, "description": "Organization ID from parall/orgs"},
    "assignee_id": {"type": "string", "required": false, "description": "Optional assignee ID"},
    "parent_id": {"type": "string", "required": false, "description": "Optional parent task ID; defaults to top-level tasks"},
    "limit": {"type": "number", "required": false, "description": "Number of tasks (default 100, max 100)"},
    "sort": {"type": "string", "required": false, "description": "Sort field (default created_at)"}
  },
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
  const parentId = args.parent_id === undefined ? 'null' : parallString(args.parent_id);
  const sort = parallString(args.sort) || 'created_at';
  const path = '/orgs/' + encodeURIComponent(org.value) + '/tasks?' + parallQuery([
    ['parent_id', parentId],
    ['assignee_id', args.assignee_id ? parallString(args.assignee_id) : null],
    ['limit', limit],
    ['sort', sort]
  ]);
  const result = await parallGet(path);
  if (!result.ok) return result.result;
  return parallListResult({
    data: result.body?.data,
    body: result.body,
    orgId: org.value,
    itemsKey: 'tasks',
    args: {org_id: org.value, assignee_id: args.assignee_id ? parallString(args.assignee_id) : null, parent_id: parentId, limit, sort},
    path,
    limit
  });
};
