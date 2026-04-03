/* @meta
{
  "name": "hackernews/top",
  "description": "获取 Hacker News 当前热门帖子",
  "domain": "news.ycombinator.com",
  "args": {
    "count": {"required": false, "description": "Number of posts (default: 20, max: 50)"}
  },
  "readOnly": true,
  "example": "bb-browser site hackernews/top 10"
}
*/

async function(args) {
  const count = Math.min(parseInt(args.count) || 20, 50);

  // Parse HN homepage HTML instead of cross-origin Firebase API (fixes #8)
  const resp = await fetch('https://news.ycombinator.com/');
  if (!resp.ok) return {error: 'HTTP ' + resp.status};

  const html = await resp.text();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const rows = Array.from(doc.querySelectorAll('tr.athing')).slice(0, count);

  const posts = rows.map((row, i) => {
    const id = Number(row.getAttribute('id'));
    const titleLink = row.querySelector('.titleline > a');
    const subtextRow = row.nextElementSibling;
    const scoreEl = subtextRow?.querySelector('.score');
    const authorEl = subtextRow?.querySelector('.hnuser');
    const links = Array.from(subtextRow?.querySelectorAll('a') || []);
    const commentsLink = links.find(a => /comment/i.test((a.textContent || '').trim())) || links[links.length - 1];
    const commentsText = (commentsLink?.textContent || '0').trim();
    const comments = commentsText === 'discuss' ? 0 : parseInt(commentsText, 10) || 0;

    return {
      rank: i + 1,
      id,
      title: titleLink?.textContent?.trim() || null,
      url: titleLink?.href || null,
      hn_url: 'https://news.ycombinator.com/item?id=' + id,
      author: authorEl?.textContent?.trim() || null,
      score: parseInt(scoreEl?.textContent || '0', 10) || 0,
      comments
    };
  }).filter(item => item.id && item.title);

  return {
    count: posts.length,
    posts
  };
}
