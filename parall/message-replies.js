module.exports = async function(args) {
  const message = parallResourceId(args.message_id, 'msg_', 'message_id');
  if (message.error) return message.error;
  const limit = parallLimit(args.limit, 50, 200);
  const cursor = args.cursor ? parallString(args.cursor) : null;
  const path = '/messages/' + encodeURIComponent(message.value) + '/replies?' + parallQuery([
    ['limit', limit], ['cursor', cursor]
  ]);
  return parallReadList({path, itemsKey: 'messages', args: {message_id: message.value, limit, ...(cursor ? {cursor} : {})}, limit});
};
