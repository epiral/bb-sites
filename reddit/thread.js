/* @meta
{
  "name": "reddit/thread",
  "description": "获取 Reddit 帖子的完整讨论树",
  "domain": "www.reddit.com",
  "args": {
    "url": {"required": true, "description": "Reddit post URL"},
    "depth": {"required": false, "description": "Comment tree depth (default: 10, max: 10)"},
    "count": {"required": false, "description": "Comment fetch limit (default: 500, max: 500)"}
  },
  "params": {
    "url": {"type": "string", "required": true, "description": "Reddit post URL"},
    "depth": {"type": "number", "required": false, "description": "Comment tree depth (default: 10, max: 10)"},
    "count": {"type": "number", "required": false, "description": "Comment fetch limit (default: 500, max: 500)"}
  },
  "auth": "optional",
  "profile": "required",
  "side_effect": "read_only",
  "retry_safety": "safe_with_backoff",
  "max_concurrency": 1,
  "serialization_key": "site:reddit:{profile}",
  "output_modes": ["legacy", "envelope_v1"],
  "timeout_class": "standard",
  "envelope_versions": ["pinix.site-result-envelope.v1"],
  "capabilities": ["network"],
  "readOnly": true,
  "example": "bb-browser site reddit/thread https://www.reddit.com/r/LocalLLaMA/comments/1rrisqn/..."
}
*/

async function(args) {
  if (!args.url) return {error: 'Missing argument: url', hint: 'Provide a Reddit post URL'};
  const parsedLimit = parseInt(args.count);
  const parsedDepth = parseInt(args.depth);
  const limit = Math.min(Math.max(Number.isFinite(parsedLimit) ? parsedLimit : 500, 1), 500);
  const depthLimit = Math.min(Math.max(Number.isFinite(parsedDepth) ? parsedDepth : 10, 0), 10);
  let path = args.url.replace(/https?:\/\/[^/]*/, '').replace(/\?.*/, '').replace(/\/*$/, '/');
  // Normalize to /r/sub/comments/POST_ID/ — strip slug and any comment suffixes
  // Handles: .../comments/ID/slug/, .../comments/ID/comment/CID/, .../comments/ID/slug/CID/
  const m = path.match(/(\/r\/[^/]+\/comments\/[^/]+\/)/);
  if (m) path = m[1];
  const canonicalUrl = 'https://www.reddit.com' + path;
  const apiUrl = path + '.json?limit=' + limit + '&depth=' + depthLimit + '&raw_json=1';
  const resp = await fetch(apiUrl, {credentials: 'include'});
  if (!resp.ok) return {error: 'HTTP ' + resp.status};
  const d = await resp.json();
  if (!d[0]?.data?.children?.[0]?.data) return {error: 'Unexpected response', hint: 'Post may be deleted or URL is incorrect'};
  const post = d[0].data.children[0].data;
  const stats = {more: 0, depth_truncated: 0, limit_truncated: 0};

  function flatten(children, depth) {
    let result = [];
    for (const child of children) {
      if (child.kind === 'more') {
        stats.more += Array.isArray(child.data?.children) ? child.data.children.length : 1;
        continue;
      }
      if (child.kind !== 't1') continue;
      const c = child.data;
      result.push({id: c.name, parent_id: c.parent_id, author: c.author, score: c.score, body: c.body, depth});
      if (c.replies?.data?.children) {
        if (depth >= depthLimit) stats.depth_truncated += c.replies.data.children.length;
        else
        result = result.concat(flatten(c.replies.data.children, depth + 1));
      }
    }
    return result;
  }

  let comments = flatten(d[1]?.data?.children || [], 0);
  if (comments.length > limit) {
    stats.limit_truncated = comments.length - limit;
    comments = comments.slice(0, limit);
  }
  const data = {
    post: {id: post.name, title: post.title, author: post.author, subreddit: post.subreddit_name_prefixed,
      score: post.score, num_comments: post.num_comments, selftext: post.selftext, url: post.url, created_utc: post.created_utc},
    comments_total: comments.length,
    comments
  };
  const partial = stats.more > 0 || stats.depth_truncated > 0 || stats.limit_truncated > 0;

  return {
    __pinix_site_result: {
      version: 'pinix.site-adapter-result.v1',
      metadata: {
        effective_args: {url: canonicalUrl, depth: depthLimit, count: limit},
        completeness: partial ? 'partial' : 'complete',
        reason: partial ? 'comments_omitted' : 'complete',
        source: {url: 'https://www.reddit.com' + apiUrl},
        pagination: {
          limit,
          depth: depthLimit,
          comments_returned: comments.length,
          more_children_omitted: stats.more,
          depth_truncated: stats.depth_truncated,
          limit_truncated: stats.limit_truncated
        },
        auth: {authenticated_as: 'unknown'},
        warnings: partial ? [{code: 'PARTIAL_COMMENTS', message: 'Some comments were omitted because Reddit returned more placeholders or adapter depth/limit was reached.'}] : undefined
      }
    },
    data
  };
}
