module.exports = async function(args) {
  const org = parallOrgId(args);
  if (org.error) return parallThrow(org.error);
  const task = parallResourceId(args.task_id, 'tsk_', 'task_id');
  if (task.error) return parallThrow(task.error);
  const confirmation = parallConfirmWrite(args);
  if (confirmation.error) return parallThrow(confirmation.error);
  if (!parallHasArg(args, 'body') || args.body === null || args.body === undefined || !String(args.body).trim()) {
    return parallThrow(parallError('Missing or invalid argument: body', 'Comment body is required and must not be empty.', 'INVALID_ARGUMENT'));
  }
  const body = String(args.body);
  if (parallUtf8Length(body) > 64 * 1024) {
    return parallThrow(parallError('Comment body is too large', 'Parall limits comment bodies to 64 KiB of UTF-8 data.', 'INVALID_ARGUMENT'));
  }

  const path = '/orgs/' + encodeURIComponent(org.value) + '/comments';
  const result = await parallWrite(path, 'POST', {target_uri: 'prll://' + task.value, body});
  if (!result.ok) return parallThrow(result.result);
  const comment = result.body;
  const targetMatches = comment?.target_uri === 'prll://' + task.value || comment?.task_id === task.value;
  if (result.status !== 201 || !comment || typeof comment !== 'object' || Array.isArray(comment)
    || !/^cmt_[A-Za-z0-9]+$/.test(parallString(comment.id)) || !targetMatches) {
    return parallThrow(parallOutcomeUnknown('Parall task comment creation returned an unexpected success response'));
  }
  return parallMutationObjectResult({
    data: comment,
    orgId: org.value,
    dataKey: 'comment',
    args: {org_id: org.value, task_id: task.value, body, confirm: confirmation.value},
    path,
    method: 'POST',
    status: result.status,
    resourceId: comment.id,
    extraWarnings: [
      {code: 'NON_IDEMPOTENT_COMMENT', message: 'The Server task-comment contract has no idempotency key. A repeated command can create a duplicate comment and notification fan-out.'},
      {code: 'COMMENT_FANOUT', message: 'A Task comment can notify watchers and referenced members/Agents; a human author may also become a Task watcher.'}
    ]
  });
};
