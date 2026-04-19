/* @meta
{
  "name": "npm/search",
  "description": "Search npm packages via registry API",
  "domain": "www.npmjs.com",
  "args": {
    "query": {"type": "string", "description": "Search query", "required": true},
    "count": {"type": "number", "description": "Number of results (default 20, max 250)", "default": 20}
  },
  "readOnly": true,
  "example": "bb-browser site npm/search \"react state management\""
}
*/

async function(args) {
  const query = args.query;
  if (!query) return {error: 'Missing required argument: query'};
  const count = Math.min(args.count || 20, 250);

  const url = `https://www.npmjs.com/search?q=${encodeURIComponent(query)}`;
  const resp = await fetch(url, {credentials: 'include'});
  if (!resp.ok) return {error: 'HTTP ' + resp.status, hint: 'Make sure a npmjs.com tab is open'};

  const html = await resp.text();
  const doc = new DOMParser().parseFromString(html, 'text/html');

  const sections = doc.querySelectorAll('section[class]');
  const packages = [];

  sections.forEach(section => {
    if (packages.length >= count) return;
    const nameEl = section.querySelector('a[href^="/package/"] h3');
    if (!nameEl) return;
    const name = nameEl.textContent.trim();
    const link = nameEl.closest('a');
    const descEl = section.querySelector('p');
    const description = descEl ? descEl.textContent.trim().substring(0, 300) : '';
    const spans = Array.from(section.querySelectorAll('span'));
    const versionSpan = spans.find(s => /^\d+\.\d+/.test(s.textContent.trim()));
    const version = versionSpan ? versionSpan.textContent.trim() : null;

    packages.push({
      name,
      version,
      description,
      url: `https://www.npmjs.com/package/${name}`
    });
  });

  return {query, count: packages.length, packages};
}
