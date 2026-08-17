module.exports = async function(args) {
  const org = parallOrgId(args);
  if (org.error) return org.error;
  const path = '/orgs/' + encodeURIComponent(org.value) + '/members/former';
  const result = await parallGet(path);
  if (!result.ok) return result.result;
  return parallListResult({
    data: result.body?.user_ids,
    body: result.body,
    orgId: org.value,
    itemsKey: 'former_member_ids',
    args: {org_id: org.value},
    path
  });
};
