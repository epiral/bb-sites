/* @meta
{
  "name": "pypi/search",
  "description": "搜索 Python 包",
  "domain": "pypi.org",
  "args": {
    "query": {"required": true, "description": "Search keyword"},
    "page": {"required": false, "description": "Page number (default 1)"}
  },
  "readOnly": true,
  "example": "bb-browser site pypi/search \"machine learning\""
}
*/

async function(args) {
  const query = args.query || args._text;
  if (!query) return {error: 'Missing query. Usage: bb-browser site pypi/search "QUERY"'};
  const page = args.page || 1;
  const url = `/search/?q=${encodeURIComponent(query)}&page=${page}`;
  const resp = await fetch(url, {credentials: 'include'});
  if (!resp.ok) return {error: 'HTTP ' + resp.status, hint: 'Make sure a pypi.org tab is open'};
  const html = await resp.text();
  const doc = new DOMParser().parseFromString(html, 'text/html');

  const snippets = doc.querySelectorAll('a.package-snippet');
  const packages = [];

  snippets.forEach(el => {
    const name = el.querySelector('.package-snippet__name')?.textContent?.trim();
    if (!name) return;
    const description = el.querySelector('.package-snippet__description')?.textContent?.trim() || '';
    const dateEl = el.querySelector('.package-snippet__created time');
    const date = dateEl?.getAttribute('datetime') || null;
    const href = el.getAttribute('href') || '';
    packages.push({
      name,
      description: description.substring(0, 300),
      date,
      url: href.startsWith('/') ? `https://pypi.org${href}` : `https://pypi.org/project/${name}/`
    });
  });

  return {query, page: Number(page), count: packages.length, packages};
}
