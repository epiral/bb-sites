module.exports = async function(args) {
  const org = parallOrgId(args);
  if (org.error) return parallThrow(org.error);
  const task = parallResourceId(args.task_id, 'tsk_', 'task_id');
  if (task.error) return parallThrow(task.error);
  const confirmation = parallConfirmWrite(args);
  if (confirmation.error) return parallThrow(confirmation.error);
  if (parallHasArg(args, 'project_id')) {
    return parallThrow(parallError('Task project migration is not supported', 'The source-exact Server contract makes project_id immutable on PATCH. Create a new task in the target project instead of guessing a move operation.', 'UNSUPPORTED_MUTATION'));
  }

  const body = {};
  const effective = {org_id: org.value, task_id: task.value, confirm: confirmation.value};

  if (parallHasArg(args, 'title')) {
    const title = parallString(args.title);
    if (!title) return parallThrow(parallError('Invalid argument: title', 'Task title must not be empty.', 'INVALID_ARGUMENT'));
    body.title = title;
    effective.title = title;
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
  if (parallHasArg(args, 'description')) {
    if (args.description === null || args.description === undefined) {
      return parallThrow(parallError('Invalid argument: description', 'Pass a string. Use an empty string only when deliberately clearing the description.', 'INVALID_ARGUMENT'));
    }
    body.description = String(args.description);
    effective.description = body.description;
  }

  const clearAssignee = parallTrueFlag(args, 'clear_assignee');
  if (clearAssignee.error) return parallThrow(clearAssignee.error);
  if (clearAssignee.value && parallHasArg(args, 'assignee_id')) {
    return parallThrow(parallError('Conflicting assignee arguments', 'Use either --assignee_id or --clear_assignee true.', 'INVALID_ARGUMENT'));
  }
  if (clearAssignee.value) {
    body.assignee_id = null;
    effective.clear_assignee = true;
  } else if (parallHasArg(args, 'assignee_id')) {
    const assignee = parallResourceId(args.assignee_id, 'usr_', 'assignee_id');
    if (assignee.error) return parallThrow(assignee.error);
    body.assignee_id = assignee.value;
    effective.assignee_id = assignee.value;
  }

  const clearDueDate = parallTrueFlag(args, 'clear_due_date');
  if (clearDueDate.error) return parallThrow(clearDueDate.error);
  if (clearDueDate.value && parallHasArg(args, 'due_date')) {
    return parallThrow(parallError('Conflicting due date arguments', 'Use either --due_date or --clear_due_date true.', 'INVALID_ARGUMENT'));
  }
  if (clearDueDate.value) {
    body.due_date = null;
    effective.clear_due_date = true;
  } else if (parallHasArg(args, 'due_date')) {
    const dueDate = parallDate(args.due_date, 'due_date');
    if (dueDate.error) return parallThrow(dueDate.error);
    body.due_date = dueDate.value;
    effective.due_date = dueDate.value;
  }

  const clearLabels = parallTrueFlag(args, 'clear_labels');
  if (clearLabels.error) return parallThrow(clearLabels.error);
  if (clearLabels.value && parallHasArg(args, 'label_ids')) {
    return parallThrow(parallError('Conflicting label arguments', 'Use either --label_ids or --clear_labels true.', 'INVALID_ARGUMENT'));
  }
  if (clearLabels.value) {
    body.label_ids = null;
    effective.clear_labels = true;
  } else if (parallHasArg(args, 'label_ids')) {
    const labels = parallLabelIds(args.label_ids);
    if (labels.error) return parallThrow(labels.error);
    body.label_ids = labels.value;
    effective.label_ids = labels.value.join(',');
  }

  const clearParent = parallTrueFlag(args, 'clear_parent');
  if (clearParent.error) return parallThrow(clearParent.error);
  if (clearParent.value && parallHasArg(args, 'parent_id')) {
    return parallThrow(parallError('Conflicting parent arguments', 'Use either --parent_id or --clear_parent true.', 'INVALID_ARGUMENT'));
  }
  if (clearParent.value) {
    body.parent_id = null;
    effective.clear_parent = true;
  } else if (parallHasArg(args, 'parent_id')) {
    const parent = parallResourceId(args.parent_id, 'tsk_', 'parent_id');
    if (parent.error) return parallThrow(parent.error);
    if (parent.value === task.value) return parallThrow(parallError('A task cannot be its own parent', 'Choose a different parent task ID.', 'INVALID_ARGUMENT'));
    body.parent_id = parent.value;
    effective.parent_id = parent.value;
  }

  if (!Object.keys(body).length) {
    return parallThrow(parallError('No task changes requested', 'Provide at least one mutable field in addition to --confirm write.', 'INVALID_ARGUMENT'));
  }

  const path = '/orgs/' + encodeURIComponent(org.value) + '/tasks/' + encodeURIComponent(task.value);
  const result = await parallWrite(path, 'PATCH', body);
  if (!result.ok) return parallThrow(result.result);
  if (result.status !== 200 || !result.body || typeof result.body !== 'object' || Array.isArray(result.body)
    || result.body.id !== task.value || !parallTaskMutationMatches(result.body, body)) {
    return parallThrow(parallOutcomeUnknown('Parall task update returned an unexpected success response'));
  }
  return parallMutationObjectResult({
    data: result.body,
    orgId: org.value,
    dataKey: 'task',
    args: effective,
    path,
    method: 'PATCH',
    status: result.status,
    resourceId: task.value,
    extraWarnings: [
      {code: 'NARROW_PATCH', message: 'Only explicitly supplied mutable fields were sent. project_id was not sent and cannot be changed by this command.'},
      {code: 'TASK_UPDATE_FANOUT', message: 'Task field changes can create activity and notify or dispatch affected assignees/watchers according to Server policy.'}
    ]
  });
};
