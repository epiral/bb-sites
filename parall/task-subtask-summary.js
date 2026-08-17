module.exports = async function(args) {
  const org = parallOrgId(args);
  if (org.error) return org.error;
  const assigneeId = args.assignee_id ? parallString(args.assignee_id) : null;
  const projectId = args.project_id ? parallString(args.project_id) : null;
  const path = '/orgs/' + encodeURIComponent(org.value) + '/tasks/subtask-summary?' + parallQuery([
    ['assignee_id', assigneeId],
    ['project_id', projectId]
  ]);
  return parallReadList({
    path,
    orgId: org.value,
    itemsKey: 'summaries',
    args: {org_id: org.value, ...(assigneeId ? {assignee_id: assigneeId} : {}), ...(projectId ? {project_id: projectId} : {})}
  });
};
