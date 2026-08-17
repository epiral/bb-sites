module.exports = async function(args) {
  const org = parallOrgId(args);
  if (org.error) return org.error;
  const path = '/orgs/' + encodeURIComponent(org.value) + '/inbox/unread-count';
  return parallReadObject({path, orgId: org.value, dataKey: 'unread', args: {org_id: org.value}});
};
