/* @meta
{
  "name": "parall/tasks",
  "description": "读取指定组织的任务列表",
  "domain": "app.parall.com",
  "args": {"org_id": {"required": true, "description": "Organization ID"}, "q": {"required": false, "description": "Text query"}, "status": {"required": false, "description": "Status filter"}, "priority": {"required": false, "description": "Priority filter"}, "assignee_id": {"required": false, "description": "Assignee ID"}, "creator_id": {"required": false, "description": "Creator ID"}, "parent_id": {"required": false, "description": "Parent task ID"}, "project_id": {"required": false, "description": "Project ID"}, "label_ids": {"required": false, "description": "Comma-separated label IDs"}, "scope": {"required": false, "description": "active, archived, or all"}, "sort": {"required": false, "description": "Sort field"}, "order": {"required": false, "description": "Sort order"}, "limit": {"required": false, "description": "Maximum 200"}, "cursor": {"required": false, "description": "Opaque pagination cursor"}},
  "params": {
    "org_id": {"type": "string", "required": true, "description": "Organization ID from parall/orgs"},
    "q": {"type": "string", "required": false, "description": "Optional text query"},
    "status": {"type": "string", "required": false, "description": "Optional status filter"},
    "priority": {"type": "string", "required": false, "description": "Optional priority filter"},
    "assignee_id": {"type": "string", "required": false, "description": "Optional assignee ID"},
    "creator_id": {"type": "string", "required": false, "description": "Optional creator ID"},
    "parent_id": {"type": "string", "required": false, "description": "Optional parent task ID; defaults to top-level tasks"},
    "project_id": {"type": "string", "required": false, "description": "Optional project ID"},
    "label_ids": {"type": "string", "required": false, "description": "Comma-separated label IDs"},
    "scope": {"type": "string", "required": false, "description": "Task scope: active, archived, or all; default active"},
    "sort": {"type": "string", "required": false, "description": "Sort field (default created_at)"},
    "order": {"type": "string", "required": false, "description": "Optional sort order"},
    "limit": {"type": "number", "required": false, "description": "Number of tasks (default 50, max 200)"},
    "cursor": {"type": "string", "required": false, "description": "Opaque next_cursor from the previous response"}
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
  const limit = parallLimit(args.limit, 50, 200);
  const parentId = args.parent_id === undefined ? 'null' : parallString(args.parent_id);
  const projectId = args.project_id ? parallString(args.project_id) : null;
  const cursor = args.cursor ? parallString(args.cursor) : null;
  const scope = parallString(args.scope) || 'active';
  const q = args.q ? parallString(args.q) : null;
  const status = args.status ? parallString(args.status) : null;
  const priority = args.priority ? parallString(args.priority) : null;
  const creatorId = args.creator_id ? parallString(args.creator_id) : null;
  const labelIds = args.label_ids ? parallString(args.label_ids) : null;
  const sort = parallString(args.sort) || 'created_at';
  const order = args.order ? parallString(args.order) : null;
  const path = '/orgs/' + encodeURIComponent(org.value) + '/tasks?' + parallQuery([
    ['q', q],
    ['status', status],
    ['priority', priority],
    ['parent_id', parentId],
    ['project_id', projectId],
    ['assignee_id', args.assignee_id ? parallString(args.assignee_id) : null],
    ['creator_id', creatorId],
    ['label_ids', labelIds],
    ['scope', scope],
    ['limit', limit],
    ['cursor', cursor],
    ['sort', sort],
    ['order', order]
  ]);
  const result = await parallGet(path);
  if (!result.ok) return result.result;
  return parallListResult({
    data: result.body?.data,
    body: result.body,
    orgId: org.value,
    itemsKey: 'tasks',
    args: {org_id: org.value, ...(q ? {q} : {}), ...(status ? {status} : {}), ...(priority ? {priority} : {}), ...(args.assignee_id ? {assignee_id: parallString(args.assignee_id)} : {}), ...(creatorId ? {creator_id: creatorId} : {}), parent_id: parentId, ...(projectId ? {project_id: projectId} : {}), ...(labelIds ? {label_ids: labelIds} : {}), scope, limit, ...(cursor ? {cursor} : {}), sort, ...(order ? {order} : {})},
    path,
    limit
  });
};
