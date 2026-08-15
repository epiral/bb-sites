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

  const stats = {fetch_missing: 0, deleted_dead: 0, non_story: 0, missing_title: 0};
  const posts = items.map((item, i) => {
    if (!item) {
      stats.fetch_missing += 1;
      return null;
    }
    if (item.deleted || item.dead) {
      stats.deleted_dead += 1;
      return null;
    }
    if (item.type !== 'story') {
      stats.non_story += 1;
      return null;
    }
    if (!item.id || !item.title) {
      stats.missing_title += 1;
      return null;
    }
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
  }).filter(Boolean);

  const data = {
    count: posts.length,
    posts
  };
  const truncated = ids.length > count;
  const selectedOmitted = stats.fetch_missing + stats.deleted_dead + stats.non_story + stats.missing_title;
  const completeness = ids.length === 0 ? 'empty' : ((truncated || selectedOmitted > 0) ? 'partial' : 'complete');
  const reason = ids.length === 0 ? 'no_items' : (
    truncated && selectedOmitted > 0 ? 'limit_truncated_and_selected_items_omitted' :
    selectedOmitted > 0 ? 'selected_items_omitted' :
    truncated ? 'limit_truncated' : 'complete'
  );

  return {
    __pinix_site_result: {
      version: 'pinix.site-adapter-result.v1',
      metadata: {
        effective_args: {count},
        completeness,
        reason,
        source: {url: topUrl},
        pagination: {
          limit: count,
          selected: selected.length,
          returned: posts.length,
          total_available: ids.length,
          truncated,
          selected_omitted: selectedOmitted,
          fetch_missing_omitted: stats.fetch_missing,
          deleted_dead_omitted: stats.deleted_dead,
          non_story_omitted: stats.non_story,
          missing_title_omitted: stats.missing_title
        },
        auth: {authenticated_as: 'not_applicable'},
        warnings: selectedOmitted > 0 ? [{code: 'SELECTED_ITEMS_OMITTED', message: 'Some selected topstories items were missing, deleted/dead, non-story, or lacked a title.'}] : undefined
      }
    },
    data
  };
}
