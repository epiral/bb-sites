/* @meta
{
  "name": "wikipedia/summary",
  "description": "维基百科摘要 (Wikipedia summary: title, extract, url)",
  "domain": "en.wikipedia.org",
  "args": {
    "title": "页面标题 (用下划线替换空格)"
  },
  "readOnly": true,
  "example": "bb-browser site wikipedia/summary \"Python_(programming_language)\""
}
*/

async function(args) {
  const title = args.title || args._input;
  if (!title) return {error: 'Missing title parameter'};
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
  const resp = await fetch(url);
  if (!resp.ok) return {error: 'HTTP ' + resp.status};
  const data = await resp.json();
  return {
    title: data.title,
    description: data.description,
    extract: data.extract,
    thumbnail: data.thumbnail?.source,
    url: data.content_urls?.desktop?.page,
    timestamp: data.timestamp
  };
}
