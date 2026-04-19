/* @meta
{
  "name": "wikipedia/search",
  "description": "维基百科搜索 (Wikipedia search: title, snippet, url)",
  "domain": "en.wikipedia.org",
  "args": {
    "query": "搜索关键词",
    "count": "返回结果数量 (默认 10)"
  },
  "readOnly": true,
  "example": "bb-browser site wikipedia/search \"artificial intelligence\""
}
*/

async function(args) {
  const query = args.query || args._input;
  if (!query) return {error: 'Missing query parameter'};
  const count = args.count || 10;
  const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&origin=*&srlimit=${count}`;
  const resp = await fetch(url);
  if (!resp.ok) return {error: 'HTTP ' + resp.status};
  const data = await resp.json();
  const results = data.query?.search || [];
  return {count: results.length, results: results.map(r => ({
    pageid: r.pageid,
    title: r.title,
    snippet: r.snippet?.replace(/<[^>]*>/g, ''),
    wordcount: r.wordcount,
    url: `https://en.wikipedia.org/wiki/${encodeURIComponent(r.title.replace(/ /g, '_'))}`
  }))};
}
