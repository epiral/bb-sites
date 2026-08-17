module.exports = async function(args) {
  const message = parallResourceId(args.message_id, 'msg_', 'message_id');
  if (message.error) return message.error;
  const path = '/messages/' + encodeURIComponent(message.value) + '/watching';
  return parallReadObject({path, dataKey: 'watching', args: {message_id: message.value}});
};
