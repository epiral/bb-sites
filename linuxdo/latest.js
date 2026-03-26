/* @meta
{
  "name": "linuxdo/latest",
  "description": "Get latest topics from Linux.do",
  "domain": "linux.do",
  "args": {
    "count": {"required": false, "description": "Number of items to return (default: 30, max: 50)"}
  },
  "capabilities": ["network"],
  "readOnly": true,
  "example": "bb-browser site linuxdo/latest 20"
}
*/

async function(args) {
  const count = Math.min(parseInt(args.count, 10) || 30, 50);
  const resp = await fetch('https://linux.do/latest.json', {
    credentials: 'include',
    headers: {
      'accept': 'application/json, text/plain, */*',
      'x-requested-with': 'XMLHttpRequest'
    }
  });

  if (!resp.ok) {
    return {
      error: 'HTTP ' + resp.status,
      hint: 'Open https://linux.do in your browser first, ensure you are logged in if required, then retry.'
    };
  }

  const data = await resp.json();
  const topics = (data.topic_list?.topics || []).slice(0, count).map((topic, index) => ({
    rank: index + 1,
    id: topic.id,
    title: topic.title,
    slug: topic.slug,
    url: `https://linux.do/t/${topic.slug}/${topic.id}`,
    posts_count: topic.posts_count,
    reply_count: Math.max((topic.posts_count || 1) - 1, 0),
    views: topic.views,
    like_count: topic.like_count,
    created_at: topic.created_at,
    bumped_at: topic.bumped_at,
    last_posted_at: topic.last_posted_at,
    pinned: !!topic.pinned,
    pinned_globally: !!topic.pinned_globally,
    visible: topic.visible !== false,
    excerpt: topic.excerpt || '',
    category_id: topic.category_id,
    tags: topic.tags || []
  }));

  return {
    count: topics.length,
    source: 'https://linux.do/latest.json',
    topics
  };
}
