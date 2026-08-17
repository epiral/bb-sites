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

  // Parse HN homepage HTML instead of the Firebase REST API. Firebase's
  // *.firebaseio.com is blocked by an ad/privacy blocker in this browser
  // environment (confirmed via direct eval — same-origin fetches to
  // news.ycombinator.com succeed, cross-origin fetches to
  // hacker-news.firebaseio.com fail with "TypeError: Failed to fetch"
  // even from a tab already on news.ycombinator.com). Same-origin HTML
  // parsing sidesteps that entirely. HN shows 30 items per page, so pull
  // a second page when count > 30.
  const pagesNeeded = Math.ceil(count / 30);
  const rows = [];
  const sourceUrls = [];
  for (let p = 1; p <= pagesNeeded; p++) {
    const pageUrl = p === 1 ? 'https://news.ycombinator.com/' : 'https://news.ycombinator.com/news?p=' + p;
    sourceUrls.push(pageUrl);
    const resp = await fetch(pageUrl);
    if (!resp.ok) return {error: 'HTTP ' + resp.status};
    const html = await resp.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    rows.push(...Array.from(doc.querySelectorAll('tr.athing')));
    if (rows.length >= count) break;
  }
  const totalAvailable = rows.length;
  const selectedRows = rows.slice(0, count);

  const stats = {missing_title: 0};
  const posts = selectedRows.map((row, i) => {
    const id = Number(row.getAttribute('id'));
    const titleLink = row.querySelector('.titleline > a');
    const subtextRow = row.nextElementSibling;
    const scoreEl = subtextRow?.querySelector('.score');
    const authorEl = subtextRow?.querySelector('.hnuser');
    const links = Array.from(subtextRow?.querySelectorAll('a') || []);
    const commentsLink = links.find(a => /comment/i.test((a.textContent || '').trim())) || links[links.length - 1];
    const commentsText = (commentsLink?.textContent || '0').trim();
    const comments = commentsText === 'discuss' ? 0 : (parseInt(commentsText, 10) || 0);
    const title = titleLink?.textContent?.trim() || null;
    if (!id || !title) {
      stats.missing_title += 1;
      return null;
    }
    return {
      rank: i + 1,
      id,
      title,
      url: titleLink?.href || null,
      hn_url: 'https://news.ycombinator.com/item?id=' + id,
      author: authorEl?.textContent?.trim() || null,
      score: parseInt(scoreEl?.textContent || '0', 10) || 0,
      comments
    };
  }).filter(Boolean);

  const data = {
    count: posts.length,
    posts
  };
  const truncated = totalAvailable > count;
  const selectedOmitted = stats.missing_title;
  const completeness = totalAvailable === 0 ? 'empty' : ((truncated || selectedOmitted > 0) ? 'partial' : 'complete');
  const reason = totalAvailable === 0 ? 'no_items' : (
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
        source: {urls: sourceUrls},
        pagination: {
          limit: count,
          selected: selectedRows.length,
          returned: posts.length,
          total_available: totalAvailable,
          truncated,
          selected_omitted: selectedOmitted,
          missing_title_omitted: stats.missing_title
        },
        auth: {authenticated_as: 'not_applicable'},
        warnings: selectedOmitted > 0 ? [{code: 'SELECTED_ITEMS_OMITTED', message: 'Some selected topstories rows lacked a title or id.'}] : undefined
      }
    },
    data
  };
}
