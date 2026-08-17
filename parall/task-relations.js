module.exports = async function(args) {
  const org = parallOrgId(args);
  if (org.error) return org.error;
  const task = parallResourceId(args.task_id, 'tsk_', 'task_id');
  if (task.error) return task.error;
  const path = '/orgs/' + encodeURIComponent(org.value) + '/tasks/' + encodeURIComponent(task.value) + '/relations';
  return parallReadList({path, orgId: org.value, itemsKey: 'relations', args: {org_id: org.value, task_id: task.value}});
};
