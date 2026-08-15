/* @meta
{
  "name": "parall/agent-sessions",
  "description": "读取指定 Agent 的会话列表",
  "domain": "app.parall.com",
  "args": {"org_id": {"required": true, "description": "Organization ID"}, "agent_id": {"required": true, "description": "Agent user ID"}, "status": {"required": false, "description": "Session status filter"}, "limit": {"required": false, "description": "Maximum 50"}, "cursor": {"required": false, "description": "Pagination cursor"}},
  "params": {"org_id": {"type": "string", "required": true, "description": "Organization ID from parall/orgs"}, "agent_id": {"type": "string", "required": true, "description": "Agent ID from parall agents"}, "status": {"type": "string", "required": false, "description": "Status filter, default open,active,idle"}, "limit": {"type": "number", "required": false, "description": "Number of sessions (default 50, max 50)"}, "cursor": {"type": "string", "required": false, "description": "next_cursor from the previous response"}},
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
  const agent = parallResourceId(args.agent_id, 'usr_', 'agent_id');
  if (agent.error) return agent.error;
  const limit = parallLimit(args.limit, 50, 50);
  const status = parallString(args.status) || 'open,active,idle';
  const cursor = args.cursor ? parallString(args.cursor) : null;
  const path = '/orgs/' + encodeURIComponent(org.value) + '/agents/' + encodeURIComponent(agent.value) + '/sessions?' + parallQuery([
    ['limit', limit],
    ['status', status],
    ['cursor', cursor]
  ]);
  const result = await parallGet(path);
  if (!result.ok) return result.result;
  return parallListResult({
    data: result.body?.data,
    body: result.body,
    orgId: org.value,
    itemsKey: 'sessions',
    args: {org_id: org.value, agent_id: agent.value, status, limit, cursor},
    path,
    limit
  });
};
