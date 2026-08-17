module.exports = async function(args) {
  const org = parallOrgId(args);
  if (org.error) return org.error;
  const project = parallResourceId(args.project_id, 'prj_', 'project_id');
  if (project.error) return project.error;
  const path = '/orgs/' + encodeURIComponent(org.value) + '/projects/' + encodeURIComponent(project.value) + '/join-requests';
  return parallReadList({path, orgId: org.value, itemsKey: 'join_requests', args: {org_id: org.value, project_id: project.value}});
};
