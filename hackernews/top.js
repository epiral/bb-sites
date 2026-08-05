/* @meta
{
  "name": "hackernews/top",
  "description": "获取 Hacker News 当前热门帖子",
  "domain": "news.ycombinator.com",
  "args": {
    "count": {"required": false, "description": "Number of posts (default: 20, max: 50)"}
  },
  "params": {
    "count": {"type": "number", "required": false, "description": "Number of posts (default: 20, max: 50)"}
  },
  "auth": "none",
  "profile": "not_applicable",
  "side_effect": "read_only",
  "retry_safety": "safe_with_backoff",
  "max_concurrency": 4,
  "serialization_key": "site:hackernews",
  "output_modes": ["legacy", "envelope_v1"],
  "timeout_class": "standard",
  "envelope_versions": ["pinix.site-result-envelope.v1"],
  "readOnly": true,
  "example": "bb-browser site hackernews/top 10"
}
*/

async function(args) {
  const parsedCount = parseInt(args.count);
  const count = Math.min(Math.max(Number.isFinite(parsedCount) ? parsedCount : 20, 1), 50);

  const topUrl = 'https://hacker-news.firebaseio.com/v0/topstories.json';
  const resp = await fetch(topUrl);
  if (!resp.ok) return {error: 'HTTP ' + resp.status};
  const ids = await resp.json();
  if (!Array.isArray(ids)) return {error: 'Unexpected response', hint: 'HN Firebase topstories response was not a list'};

  const selected = ids.slice(0, count);
  const items = await Promise.all(selected.map(async id => {
    const itemUrl = 'https://hacker-news.firebaseio.com/v0/item/' + id + '.json';
    const itemResp = await fetch(itemUrl);
    if (!itemResp.ok) return null;
    return await itemResp.json();
  }));

  const posts = items.map((item, i) => {
    if (!item || item.deleted || item.dead || item.type !== 'story') return null;
    return {
      rank: i + 1,
      id: item.id,
      title: item.title || null,
      url: item.url || null,
      hn_url: 'https://news.ycombinator.com/item?id=' + item.id,
      author: item.by || null,
      score: item.score || 0,
      comments: item.descendants || 0
    };
  }).filter(item => item && item.id && item.title);

  const data = {
    count: posts.length,
    posts
  };
  const truncated = ids.length > count;
  const completeness = posts.length === 0 ? 'empty' : (truncated ? 'partial' : 'complete');

  return {
    __pinix_site_result: {
      version: 'pinix.site-adapter-result.v1',
      metadata: {
        effective_args: {count},
        completeness,
        reason: posts.length === 0 ? 'no_items' : (truncated ? 'limit_truncated' : 'complete'),
        source: {url: topUrl},
        pagination: {
          limit: count,
          returned: posts.length,
          total_available: ids.length,
          truncated
        },
        auth: {authenticated_as: 'not_applicable'}
      }
    },
    data
  };
}
