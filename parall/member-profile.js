module.exports = async function(args) {
  const org = parallOrgId(args);
  if (org.error) return org.error;
  const user = parallResourceId(args.user_id, 'usr_', 'user_id');
  if (user.error) return user.error;
  const path = '/orgs/' + encodeURIComponent(org.value) + '/members/' + encodeURIComponent(user.value) + '/profile';
  return parallReadObject({path, orgId: org.value, dataKey: 'profile', args: {org_id: org.value, user_id: user.value}});
};
