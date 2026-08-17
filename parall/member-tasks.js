module.exports = async function(args) {
  const org = parallOrgId(args);
  if (org.error) return org.error;
  const member = parallResourceId(args.member_id, 'usr_', 'member_id');
  if (member.error) return member.error;
  const limit = parallLimit(args.limit, 50, 200);
  const cursor = args.cursor ? parallString(args.cursor) : null;
  const path = '/orgs/' + encodeURIComponent(org.value) + '/members/' + encodeURIComponent(member.value) + '/tasks?' + parallQuery([
    ['limit', limit], ['cursor', cursor]
  ]);
  return parallReadList({path, orgId: org.value, itemsKey: 'tasks', args: {org_id: org.value, member_id: member.value, limit, ...(cursor ? {cursor} : {})}, limit});
};
