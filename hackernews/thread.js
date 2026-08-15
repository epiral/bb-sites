/* @meta
{
  "name": "hackernews/thread",
  "description": "获取 Hacker News 帖子的评论树",
  "domain": "news.ycombinator.com",
  "args": {
    "id": {"required": true, "description": "HN item ID or URL"},
    "depth": {"required": false, "description": "Comment tree depth (default: 2, max: 5)"}
  },
  "params": {
    "id": {"type": "string", "required": true, "description": "HN item ID or URL"},
    "depth": {"type": "number", "required": false, "description": "Comment tree depth (default: 2, max: 5)"}
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
  "capabilities": ["network"],
  "readOnly": true,
  "example": "bb-browser site hackernews/thread 12345678"
}
*/

async function(args) {
  if (args.id === undefined || args.id === null || args.id === '') return {error: 'Missing argument: id', hint: 'Provide an HN item ID or item URL'};
  let itemId = String(args.id);
  const urlMatch = itemId.match(/id=(\d+)/);
  if (urlMatch) itemId = urlMatch[1];
  const parsedDepth = parseInt(args.depth);
  const depthLimit = Math.min(Math.max(Number.isFinite(parsedDepth) ? parsedDepth : 2, 0), 5);
  const stats = {deleted_dead: 0, depth_truncated: 0, child_limit_truncated: 0};

  const itemUrl = 'https://hacker-news.firebaseio.com/v0/item/' + itemId + '.json';
  const resp = await fetch(itemUrl);
  if (!resp.ok) return {error: 'HTTP ' + resp.status};
  const item = await resp.json();
  if (!item) return {error: 'Item not found', hint: 'Check the ID: ' + itemId};
  const rootUnavailable = !!(item.deleted || item.dead);

  // Fetch comment tree with bounded depth and fanout for performance.
  async function fetchComments(ids, depth) {
    if (!ids || ids.length === 0) return [];
    if (depth > depthLimit) {
      stats.depth_truncated += ids.length;
      return [];
    }
    if (ids.length > 30) stats.child_limit_truncated += ids.length - 30;
    const comments = await Promise.all(ids.slice(0, 30).map(async id => {
      const r = await fetch('https://hacker-news.firebaseio.com/v0/item/' + id + '.json');
      const c = await r.json();
      if (!c || c.deleted || c.dead) {
        stats.deleted_dead += 1;
        return null;
      }
      return {
        id: c.id, author: c.by, text: c.text, time: c.time, depth,
        replies: await fetchComments(c.kids, depth + 1)
      };
    }));
    return comments.filter(Boolean);
  }

  const comments = await fetchComments(item.kids, 0);
  function countComments(nodes) {
    return nodes.reduce((total, node) => total + 1 + countComments(node.replies || []), 0);
  }
  const commentsReturned = countComments(comments);
  const data = {
    post: {id: item.id, title: item.title, url: item.url || null, hn_url: 'https://news.ycombinator.com/item?id=' + item.id, author: item.by, score: item.score, comments_count: item.descendants || 0, time: item.time, text: item.text},
    comments
  };
  const partial = rootUnavailable || stats.deleted_dead > 0 || stats.depth_truncated > 0 || stats.child_limit_truncated > 0;
  const reason = rootUnavailable ? 'root_unavailable' : (partial ? 'comments_omitted' : 'complete');

  return {
    __pinix_site_result: {
      version: 'pinix.site-adapter-result.v1',
      metadata: {
        effective_args: {id: String(itemId), depth: depthLimit},
        completeness: partial ? 'partial' : 'complete',
        reason,
        source: {url: itemUrl},
        pagination: {
          depth: depthLimit,
          comments_returned: commentsReturned,
          top_level_comments_returned: comments.length,
          root_deleted: item.deleted ? 1 : 0,
          root_dead: item.dead ? 1 : 0,
          deleted_dead_omitted: stats.deleted_dead,
          depth_truncated: stats.depth_truncated,
          child_limit_truncated: stats.child_limit_truncated
        },
        auth: {authenticated_as: 'not_applicable'},
        warnings: rootUnavailable
          ? [{code: 'ROOT_UNAVAILABLE', message: 'The root HN item is deleted or dead; legacy data is preserved but completeness is partial.'}]
          : (partial ? [{code: 'PARTIAL_COMMENTS', message: 'Some comments were omitted because they were deleted/dead or beyond adapter depth/fanout limits.'}] : undefined)
      }
    },
    data
  };
}
