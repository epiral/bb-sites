/* @meta
{
  "name": "linuxdo/topic",
  "description": "Get a Linux.do topic by id",
  "domain": "linux.do",
  "args": {
    "id": {"required": true, "description": "Linux.do topic id"},
    "posts": {"required": false, "description": "Number of posts to return (default: 20, max: 100)"}
  },
  "capabilities": ["network"],
  "readOnly": true,
  "example": "bb-browser site linuxdo/topic 1812710 --posts 10"
}
*/

async function(args) {
  const id = String(args.id || '').trim();
  if (!id) {
    return { error: 'missing required argument "id"' };
  }

  const postLimit = Math.min(parseInt(args.posts, 10) || 20, 100);
  const endpoints = [
    `https://linux.do/t/${id}.json`,
    `https://linux.do/t/topic/${id}.json`
  ];

  let data = null;
  let source = null;
  let lastStatus = null;

  for (const url of endpoints) {
    const resp = await fetch(url, {
      credentials: 'include',
      headers: {
        'accept': 'application/json, text/plain, */*',
        'x-requested-with': 'XMLHttpRequest'
      }
    });

    if (resp.ok) {
      data = await resp.json();
      source = url;
      break;
    }

    lastStatus = resp.status;
  }

  if (!data) {
    return {
      error: 'HTTP ' + (lastStatus || 404),
      hint: 'Open https://linux.do in your browser first and verify the topic id exists, then retry.'
    };
  }

  const toText = (html) => {
    if (!html) return '';
    const div = document.createElement('div');
    div.innerHTML = html;
    return (div.textContent || '').replace(/\s+/g, ' ').trim();
  };

  const posts = (data.post_stream?.posts || []).slice(0, postLimit).map((post) => ({
    id: post.id,
    post_number: post.post_number,
    username: post.username,
    name: post.name || post.display_username || '',
    created_at: post.created_at,
    updated_at: post.updated_at,
    reply_count: post.reply_count,
    reads: post.reads,
    score: post.score,
    can_edit: !!post.can_edit,
    can_delete: !!post.can_delete,
    url: post.post_url ? `https://linux.do${post.post_url}` : `https://linux.do/t/${data.slug || 'topic'}/${data.id}/${post.post_number}`,
    cooked: post.cooked || '',
    text: toText(post.cooked || '')
  }));

  return {
    source,
    topic: {
      id: data.id,
      title: data.title,
      slug: data.slug,
      fancy_title: data.fancy_title,
      url: `https://linux.do/t/${data.slug || 'topic'}/${data.id}`,
      posts_count: data.posts_count,
      reply_count: data.reply_count,
      views: data.views,
      like_count: data.like_count,
      created_at: data.created_at,
      last_posted_at: data.last_posted_at,
      bumped_at: data.bumped_at,
      archetype: data.archetype,
      pinned: !!data.pinned,
      pinned_globally: !!data.pinned_globally,
      visible: data.visible !== false,
      category_id: data.category_id,
      tags: data.tags || []
    },
    post_count: posts.length,
    posts
  };
}
