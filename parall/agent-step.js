module.exports = async function(args) {
  const org = parallOrgId(args);
  if (org.error) return org.error;
  const agent = parallResourceId(args.agent_id, 'usr_', 'agent_id');
  if (agent.error) return agent.error;
  const session = parallOpaqueId(args.session_id, 'session_id');
  if (session.error) return session.error;
  const step = parallOpaqueId(args.step_id, 'step_id');
  if (step.error) return step.error;
  const path = '/orgs/' + encodeURIComponent(org.value) + '/agents/' + encodeURIComponent(agent.value) + '/sessions/' + encodeURIComponent(session.value) + '/steps/' + encodeURIComponent(step.value);
  return parallReadObject({
    path,
    orgId: org.value,
    dataKey: 'step',
    args: {org_id: org.value, agent_id: agent.value, session_id: session.value, step_id: step.value},
    governance: true,
    extraWarnings: [{code: 'CONTEXT_REDACTION_POSSIBLE', message: 'Non-governance readers may receive a summarized step projection.'}]
  });
};
