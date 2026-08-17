module.exports = async function(args) {
  const org = parallOrgId(args);
  if (org.error) return org.error;
  const path = '/orgs/' + encodeURIComponent(org.value) + '/projects/library';
  return parallReadList({path, orgId: org.value, itemsKey: 'projects', args: {org_id: org.value}});
};
