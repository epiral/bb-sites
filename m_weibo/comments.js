/* @meta
{
  "name": "m_weibo/comments",
  "description": "Get comments for a Weibo post (mobile site)",
  "domain": "m.weibo.cn",
  "args": {
    "id": {"required": true, "description": "Post ID (mid)"},
    "max_id": {"required": false, "description": "Pagination ID (from previous response)"}
  },
  "capabilities": ["network"],
  "readOnly": true,
  "example": "bb-browser site m_weibo/comments 5274888946583083"
}
*/

async function(args) {
  if (!args.id) return {error: 'Missing argument: id'};
  const max_id = args.max_id || '';

  // Use the mobile API for hot comments
  let url = '/comments/hotflow?id=' + args.id + '&mid=' + args.id + '&max_id_type=0';
  if (max_id) url += '&max_id=' + max_id;

  const resp = await fetch(url, {
    credentials: 'include',
    headers: {
      'MWeibo-Pwa': '1',
      'X-Requested-With': 'XMLHttpRequest'
    }
  });

  if (!resp.ok) return {error: 'HTTP ' + resp.status, hint: 'Post might not exist or need login'};
  const data = await resp.json();
  if (!data.ok) return {error: 'API error: ' + (data.msg || 'unknown')};

  const strip = (html) => (html || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').trim();

  const list = (data.data?.data || []).map(c => ({
    id: c.id,
    text: strip(c.text || ''),
    user: c.user?.screen_name || '[unknown]',
    uid: c.user?.id,
    created_at: c.created_at,
    likes_count: c.like_count || 0,
    reply_count: c.total_number || 0
  }));

  return {
    id: args.id,
    max_id: data.data?.max_id || '',
    count: list.length,
    comments: list
  };
}
