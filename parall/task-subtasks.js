module.exports = async function(args) {
  const org = parallOrgId(args);
  if (org.error) return org.error;
  const task = parallResourceId(args.task_id, 'tsk_', 'task_id');
  if (task.error) return task.error;
  const limit = parallLimit(args.limit, 50, 200);
  const cursor = args.cursor ? parallString(args.cursor) : null;
  const sort = args.sort ? parallString(args.sort) : null;
  const order = args.order ? parallString(args.order) : null;
  const path = '/orgs/' + encodeURIComponent(org.value) + '/tasks/' + encodeURIComponent(task.value) + '/subtasks?' + parallQuery([
    ['limit', limit], ['cursor', cursor], ['sort', sort], ['order', order]
  ]);
  return parallReadList({
    path,
    orgId: org.value,
    itemsKey: 'tasks',
    args: {org_id: org.value, task_id: task.value, limit, ...(cursor ? {cursor} : {}), ...(sort ? {sort} : {}), ...(order ? {order} : {})},
    limit
  });
};
