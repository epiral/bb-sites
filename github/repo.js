/* @meta
{
  "name": "github/repo",
  "description": "获取 GitHub 仓库信息",
  "domain": "github.com",
  "args": {
    "repo": {"required": true, "description": "owner/repo format (e.g. epiral/bb-browser)"}
  },
  "capabilities": ["network"],
  "readOnly": true,
  "example": "bb-browser site github/repo epiral/bb-browser"
}
*/

async function(args) {
  if (!args.repo) return {error: 'Missing argument: repo', hint: 'Use owner/repo format'};
  const parts = args.repo.split('/');
  if (parts.length !== 2) return {error: 'Invalid repo format', hint: 'Use owner/repo format (e.g. epiral/pinix)'};

  const url = `https://github.com/${args.repo}`;
  const resp = await fetch(url, {credentials: 'include'});
  if (!resp.ok) return {error: 'HTTP ' + resp.status, hint: resp.status === 404 ? 'Repo not found: ' + args.repo : 'GitHub error'};

  const html = await resp.text();
  const doc = new DOMParser().parseFromString(html, 'text/html');

  const desc = doc.querySelector('p.f4.my-3')?.textContent?.trim()
    || doc.querySelector('[itemprop="about"]')?.textContent?.trim() || null;

  const lang = doc.querySelector('[itemprop="programmingLanguage"]')?.textContent?.trim() || null;

  const metaOG = {};
  doc.querySelectorAll('meta[property^="og:"]').forEach(el => {
    const prop = el.getAttribute('property')?.replace('og:', '');
    if (prop) metaOG[prop] = el.getAttribute('content');
  });

  const counters = {};
  doc.querySelectorAll('a[href$="/stargazers"] .Counter, a[href$="/forks"] .Counter, a[href$="/watchers"] .Counter').forEach(el => {
    const href = el.closest('a')?.getAttribute('href') || '';
    const val = el.getAttribute('title') || el.textContent?.trim() || '0';
    if (href.endsWith('/stargazers')) counters.stars = parseInt(val.replace(/,/g, ''), 10) || 0;
    if (href.endsWith('/forks')) counters.forks = parseInt(val.replace(/,/g, ''), 10) || 0;
  });

  const topicEls = doc.querySelectorAll('a.topic-tag');
  const topics = Array.from(topicEls).map(a => a.textContent.trim()).filter(Boolean);

  const licenseEl = doc.querySelector('a[href*="LICENSE"], a[data-analytics-event*="LICENSE"]');
  const license = licenseEl?.textContent?.trim() || null;

  return {
    full_name: args.repo,
    description: desc || metaOG.description || null,
    language: lang,
    url,
    stars: counters.stars ?? null,
    forks: counters.forks ?? null,
    topics: topics.length ? topics : null,
    license
  };
}
