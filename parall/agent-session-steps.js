module.exports = async function(args) {
  const org = parallOrgId(args);
  if (org.error) return org.error;
  const agent = parallResourceId(args.agent_id, 'usr_', 'agent_id');
  if (agent.error) return agent.error;
  const session = parallOpaqueId(args.session_id, 'session_id');
  if (session.error) return session.error;
  const limit = parallLimit(args.limit, 200, 1000);
  const cursor = args.cursor ? parallString(args.cursor) : null;
  const path = '/orgs/' + encodeURIComponent(org.value) + '/agents/' + encodeURIComponent(agent.value) + '/sessions/' + encodeURIComponent(session.value) + '/steps?' + parallQuery([
    ['limit', limit], ['cursor', cursor]
  ]);
  return parallReadList({
    path,
    orgId: org.value,
    itemsKey: 'steps',
    args: {org_id: org.value, agent_id: agent.value, session_id: session.value, limit, ...(cursor ? {cursor} : {})},
    limit,
    governance: true,
    extraWarnings: [{code: 'CONTEXT_REDACTION_POSSIBLE', message: 'Non-governance readers may receive filtered or summarized steps; the provider cursor still follows raw-row pagination.'}]
  });
};
