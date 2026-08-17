module.exports = async function(args) {
  const org = parallOrgId(args);
  if (org.error) return org.error;
  const path = '/orgs/' + encodeURIComponent(org.value);
  return parallReadObject({path, orgId: org.value, dataKey: 'org', args: {org_id: org.value}});
};
