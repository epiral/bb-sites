module.exports = async function(args) {
  const org = parallOrgId(args);
  if (org.error) return org.error;
  const chat = parallResourceId(args.chat_id, 'cht_', 'chat_id');
  if (chat.error) return chat.error;
  const path = '/orgs/' + encodeURIComponent(org.value) + '/chats/' + encodeURIComponent(chat.value);
  return parallReadObject({path, orgId: org.value, dataKey: 'chat', args: {org_id: org.value, chat_id: chat.value}});
};
