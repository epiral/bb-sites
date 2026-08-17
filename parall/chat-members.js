module.exports = async function(args) {
  const org = parallOrgId(args);
  if (org.error) return org.error;
  const chat = parallResourceId(args.chat_id, 'cht_', 'chat_id');
  if (chat.error) return chat.error;
  const path = '/orgs/' + encodeURIComponent(org.value) + '/chats/' + encodeURIComponent(chat.value) + '/members';
  return parallReadList({path, orgId: org.value, itemsKey: 'members', args: {org_id: org.value, chat_id: chat.value}});
};
