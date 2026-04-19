/* @meta
{
  "name": "devto/search",
  "description": "Search Dev.to articles by keyword",
  "domain": "dev.to",
  "args": {
    "query": { "required": true, "description": "Search keyword or phrase" },
    "count": { "required": false, "description": "Number of results (default 20, max 60)" }
  },
  "readOnly": true,
  "example": "bb-browser site devto/search \"rust programming\""
}
*/

async function(args) {
  const query = args.query;
  if (!query) return { error: 'query is required' };
  const count = Math.min(args.count || 20, 60);

  const appId = 'PRSOBFP46H';
  const apiKey = '9aa7d31610cba78851c9b1f63776a9dd';
  const url = `https://${appId}-dsn.algolia.net/1/indexes/Article_production/query?x-algolia-application-id=${appId}&x-algolia-api-key=${apiKey}`;

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: JSON.stringify({ query, hitsPerPage: String(count), queryType: 'prefixNone', page: '0' })
  });

  if (!resp.ok) return { error: 'HTTP ' + resp.status, hint: 'Algolia API error' };
  const data = await resp.json();
  const hits = data.hits || [];

  return {
    query,
    count: hits.length,
    articles: hits.map(a => ({
      title: a.title,
      url: a.path ? ('https://dev.to' + a.path) : null,
      author: a.user?.name || null,
      username: a.user?.username || null,
      published_at: a.readable_publish_date || null,
      reactions: a.public_reactions_count || 0,
      comments: a.comments_count || 0,
      tags: a.tag_list || [],
      reading_time: a.reading_time || null
    }))
  };
}
