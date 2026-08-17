module.exports = async function(args) {
  const org = parallOrgId(args);
  if (org.error) return org.error;
  const targetType = parallString(args.target_type);
  const target = parallOpaqueId(args.target_id, 'target_id');
  if (!targetType) return parallError('Missing argument: target_type', 'Provide the exact target type used by the relation.', 'INVALID_ARGUMENT');
  if (target.error) return target.error;
  const path = '/orgs/' + encodeURIComponent(org.value) + '/task-relations?' + parallQuery([
    ['target_type', targetType], ['target_id', target.value]
  ]);
  return parallReadList({path, orgId: org.value, itemsKey: 'relations', args: {org_id: org.value, target_type: targetType, target_id: target.value}});
};
