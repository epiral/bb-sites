module.exports = async function(args) {
  const org = parallOrgId(args);
  if (org.error) return org.error;
  const agent = parallResourceId(args.agent_id, 'usr_', 'agent_id');
  if (agent.error) return agent.error;
  const limit = parallLimit(args.limit, 50, 200);
  const cursor = args.cursor ? parallString(args.cursor) : null;
  const path = '/orgs/' + encodeURIComponent(org.value) + '/agents/' + encodeURIComponent(agent.value) + '/tasks?' + parallQuery([
    ['limit', limit], ['cursor', cursor]
  ]);
  return parallReadList({path, orgId: org.value, itemsKey: 'tasks', args: {org_id: org.value, agent_id: agent.value, limit, ...(cursor ? {cursor} : {})}, limit});
};
