/* @meta
{
  "name": "openlibrary/search",
  "description": "Open Library 图书搜索 (book search: title, authors, year)",
  "domain": "openlibrary.org",
  "args": {
    "query": {"type": "string", "required": true, "description": "搜索关键词"},
    "count": {"type": "number", "required": false, "default": 10, "description": "返回数量"}
  },
  "readOnly": true,
  "example": "bb-browser site openlibrary/search \"machine learning\""
}
*/

async function(args) {
  const query = encodeURIComponent(args.query);
  const limit = args.count || 10;
  const resp = await fetch(`https://openlibrary.org/search.json?q=${query}&limit=${limit}`);
  if (!resp.ok) return {error: 'HTTP ' + resp.status};
  const data = await resp.json();
  return {
    total: data.numFound,
    count: data.docs.length,
    books: data.docs.map(d => ({
      title: d.title,
      authors: d.author_name || [],
      firstPublishYear: d.first_publish_year,
      isbn: (d.isbn || []).slice(0, 3),
      subjects: (d.subject || []).slice(0, 5),
      pages: d.number_of_pages_median,
      cover: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg` : null,
      url: d.key ? `https://openlibrary.org${d.key}` : null
    }))
  };
}
