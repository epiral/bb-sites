module.exports = async function(args) {
  const org = parallOrgId(args);
  if (org.error) return org.error;
  const agent = parallResourceId(args.agent_id, 'usr_', 'agent_id');
  if (agent.error) return agent.error;
  const path = '/orgs/' + encodeURIComponent(org.value) + '/agents/' + encodeURIComponent(agent.value) + '/instructions';
  return parallReadObject({
    path,
    orgId: org.value,
    dataKey: 'instructions',
    args: {org_id: org.value, agent_id: agent.value},
    governance: true,
    extraWarnings: [{code: 'NO_STORE_RESPONSE', message: 'The source endpoint is marked Cache-Control: no-store; do not persist this response unnecessarily.'}]
  });
};
