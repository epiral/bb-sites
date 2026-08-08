/* @meta
{
  "name": "linuxdo/search",
  "description": "Search Linux.do topics and posts with advanced filters",
  "domain": "linux.do",
  "args": {
    "query": {"required": true, "description": "Search query string"},
    "category": {"required": false, "description": "Category name (e.g. 福利羊毛, VPS)"},
    "count": {"required": false, "description": "Number of results (default: 20, max: 50)"}
  },
  "capabilities": ["network"],
  "readOnly": true,
  "example": "bb-browser site linuxdo/search \"甲骨文\" 福利羊毛 5"
}
*/

async function(args) {
  const query = args[0] || args.query;
  if (!query) return { error: 'Missing search query.' };

  const second = args[1] || args.category;
  const third = args[2] || args.count;

  // Category: string arg that's not a number
  const category = second && !/^\d+$/.test(String(second)) ? String(second) : null;

  // Count: numeric arg
  const countRaw = /^\d+$/.test(String(second)) ? second : (third && /^\d+$/.test(String(third)) ? third : null);
  const count = Math.min(parseInt(countRaw, 10) || 20, 50);

  // Build search query
  let searchQuery = query;
  if (category) {
    searchQuery += ` category:${category}`;
  }

  const url = `https://linux.do/search.json?q=${encodeURIComponent(searchQuery)}&page=0`;

  const resp = await fetch(url, {
    credentials: 'include',
    headers: {
      'accept': 'application/json, text/plain, */*',
      'x-requested-with': 'XMLHttpRequest'
    }
  });

  if (!resp.ok) {
    return {
      error: 'HTTP ' + resp.status,
      hint: 'Open https://linux.do in your browser first, ensure you are logged in.'
    };
  }

  const data = await resp.json();

  const topics = (data.topics || []).slice(0, count).map((topic, index) => ({
    rank: index + 1,
    id: topic.id,
    title: topic.title,
    slug: topic.slug,
    url: `https://linux.do/t/${topic.slug}/${topic.id}`,
    posts_count: topic.posts_count,
    views: topic.views,
    like_count: topic.like_count,
    created_at: topic.created_at,
    bumped_at: topic.bumped_at,
    category_id: topic.category_id,
    tags: topic.tags || []
  }));

  const posts = (data.posts || []).slice(0, count).map(post => ({
    topic_id: post.topic_id,
    post_number: post.number,
    username: post.username,
    created_at: post.created_at,
    like_count: post.like_count,
    blurb: (post.blurb || '').substring(0, 300)
  }));

  return {
    query: searchQuery,
    filters: category ? { category } : undefined,
    topics_count: topics.length,
    posts_count: posts.length,
    topics,
    posts
  };
}
