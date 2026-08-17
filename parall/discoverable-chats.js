module.exports = async function(args) {
  const org = parallOrgId(args);
  if (org.error) return org.error;
  const q = args.q ? parallString(args.q) : null;
  const limit = args.limit === undefined ? null : parallLimit(args.limit, 50, 200);
  const path = '/orgs/' + encodeURIComponent(org.value) + '/chats/discoverable?' + parallQuery([
    ['q', q], ['limit', limit]
  ]);
  return parallReadList({path, orgId: org.value, itemsKey: 'chats', args: {org_id: org.value, ...(q ? {q} : {}), ...(limit ? {limit} : {})}, limit});
};
