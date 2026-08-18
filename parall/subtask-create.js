module.exports = async function(args) {
  const org = parallOrgId(args);
  if (org.error) return parallThrow(org.error);
  const project = parallResourceId(args.project_id, 'prj_', 'project_id');
  if (project.error) return parallThrow(project.error);
  const parent = parallResourceId(args.parent_id, 'tsk_', 'parent_id');
  if (parent.error) return parallThrow(parent.error);
  const confirmation = parallConfirmWrite(args);
  if (confirmation.error) return parallThrow(confirmation.error);
  const title = parallString(args.title);
  if (!title) return parallThrow(parallError('Missing or invalid argument: title', 'Subtask title is required and must not be empty.', 'INVALID_ARGUMENT'));

  const body = {title, project_id: project.value, parent_id: parent.value};
  const effective = {
    org_id: org.value,
    project_id: project.value,
    parent_id: parent.value,
    title,
    confirm: confirmation.value
  };

  if (parallHasArg(args, 'description')) {
    if (args.description === null || args.description === undefined) {
      return parallThrow(parallError('Invalid argument: description', 'Pass a string or omit the field.', 'INVALID_ARGUMENT'));
    }
    body.description = String(args.description);
    effective.description = body.description;
  }
  if (parallHasArg(args, 'status')) {
    const status = parallEnum(args.status, ['todo', 'in_progress', 'in_review', 'done', 'canceled'], 'status');
    if (status.error) return parallThrow(status.error);
    body.status = status.value;
    effective.status = status.value;
  }
  if (parallHasArg(args, 'priority')) {
    const priority = parallEnum(args.priority, ['high', 'normal', 'low'], 'priority');
    if (priority.error) return parallThrow(priority.error);
    body.priority = priority.value;
    effective.priority = priority.value;
  }
  if (parallHasArg(args, 'assignee_id')) {
    const assignee = parallResourceId(args.assignee_id, 'usr_', 'assignee_id');
    if (assignee.error) return parallThrow(assignee.error);
    body.assignee_id = assignee.value;
    effective.assignee_id = assignee.value;
  }
  if (parallHasArg(args, 'due_date')) {
    const dueDate = parallDate(args.due_date, 'due_date');
    if (dueDate.error) return parallThrow(dueDate.error);
    body.due_date = dueDate.value;
    effective.due_date = dueDate.value;
  }
  if (parallHasArg(args, 'label_ids')) {
    const labels = parallLabelIds(args.label_ids);
    if (labels.error) return parallThrow(labels.error);
    body.label_ids = labels.value;
    effective.label_ids = labels.value.join(',');
  }

  const path = '/orgs/' + encodeURIComponent(org.value) + '/tasks';
  const result = await parallWrite(path, 'POST', body);
  if (!result.ok) return parallThrow(result.result);
  const created = result.body;
  if (result.status !== 201 || !created || typeof created !== 'object' || Array.isArray(created)
    || !/^tsk_[A-Za-z0-9]+$/.test(parallString(created.id))
    || created.project_id !== project.value || created.parent_id !== parent.value
    || !parallTaskMutationMatches(created, body)) {
    return parallThrow(parallOutcomeUnknown('Parall Subtask creation returned an unexpected success response'));
  }
  return parallMutationObjectResult({
    data: created,
    orgId: org.value,
    dataKey: 'task',
    args: effective,
    path,
    method: 'POST',
    status: result.status,
    resourceId: created.id,
    extraWarnings: [
      {code: 'NON_IDEMPOTENT_CREATE', message: 'The Server task-create contract has no client idempotency key. A repeated command can create a duplicate Subtask.'},
      {code: 'TASK_CREATE_FANOUT', message: 'Creating a Subtask makes the creator a watcher and can notify or dispatch an assignee according to Server policy.'}
    ]
  });
};
