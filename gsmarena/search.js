/* @meta
{
  "name": "gsmarena/search",
  "description": "GSMArena 手机搜索",
  "domain": "www.gsmarena.com",
  "args": {
    "query": {"required": true, "description": "Phone name to search (e.g. iPhone 16, Galaxy S25)"}
  },
  "readOnly": true,
  "example": "bb-browser site gsmarena/search \"iPhone 16\""
}
*/

async function(args) {
  if (!args.query) return {error: 'Missing argument: query', hint: 'Provide a phone name to search'};

  const q = encodeURIComponent(args.query);
  const url = '/results.php3?sQuickSearch=yes&sName=' + q;
  const resp = await fetch(url, {credentials: 'include'});
  if (!resp.ok) return {error: 'HTTP ' + resp.status, hint: 'Make sure a gsmarena.com tab is open'};

  const html = await resp.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  const title = doc.querySelector('title')?.textContent || '';
  if (title.includes('Turnstile') || title.includes('challenge') || doc.querySelector('#turnstile-wrapper, .cf-turnstile')) {
    return {error: 'Cloudflare Turnstile challenge', hint: 'Open gsmarena.com in bb-browser first and complete the challenge, then retry', action: 'bb-browser open https://www.gsmarena.com'};
  }

  const items = doc.querySelectorAll('div.makers ul li');
  const results = [];

  items.forEach(el => {
    const anchor = el.querySelector('a');
    if (!anchor) return;
    const href = anchor.getAttribute('href');
    const img = el.querySelector('img');
    const nameEl = el.querySelector('span') || el.querySelector('strong');
    const phoneName = nameEl ? nameEl.textContent.trim().replace(/\n/g, ' ') : anchor.textContent.trim();
    const specs = img?.getAttribute('title') || null;
    const phoneUrl = href ? 'https://www.gsmarena.com/' + href : '';

    if (phoneName) results.push({name: phoneName, url: phoneUrl, specs});
  });

  return {query: args.query, count: results.length, results: results};
}
