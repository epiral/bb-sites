/* @meta
{
  "name": "toutiao/hot",
  "description": "今日头条热榜 (Toutiao trending: title, hot_value)",
  "domain": "www.toutiao.com",
  "args": {
    "count": {"required": false, "description": "返回条数 (默认 20, 最多 50)"}
  },
  "readOnly": true,
  "example": "bb-browser site toutiao/hot"
}
*/

async function(args) {
  const count = Math.min(parseInt(args.count) || 20, 50);

  const resp = await fetch('/hot-event/hot-board/?origin=toutiao_pc', {credentials: 'include'});
  if (!resp.ok) {
    // Fallback: parse hot search from homepage
    return await fallbackFromHomepage(count);
  }

  let data;
  try {
    data = await resp.json();
  } catch (e) {
    return await fallbackFromHomepage(count);
  }

  if (!data || !data.data) {
    return await fallbackFromHomepage(count);
  }

  const items = (data.data || data.fixed_top_data || []).slice(0, count).map((item, i) => ({
    rank: i + 1,
    title: item.Title || item.title || '',
    hot_value: item.HotValue || item.hot_value || 0,
    label: item.Label || item.label || '',
    url: cleanUrl(item.Url || item.url || '')
  }));

  return {count: items.length, items};

  function cleanUrl(url) {
    try { return new URL(url).origin + new URL(url).pathname; } catch { return url; }
  }

  async function fallbackFromHomepage(limit) {
    const homeResp = await fetch('/', {credentials: 'include'});
    if (!homeResp.ok) return {error: 'HTTP ' + homeResp.status, hint: 'Open www.toutiao.com in bb-browser first'};

    const html = await homeResp.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // Try to extract hot search data from SSR HTML
    const items = [];

    // Method 1: Look for hot search region text
    const allText = doc.body?.textContent || '';

    // Method 2: Parse script tags for embedded data
    const scripts = doc.querySelectorAll('script:not([src])');
    for (const script of scripts) {
      const text = script.textContent || '';
      if (text.includes('hotBoard') || text.includes('hot_board') || text.includes('HotValue')) {
        try {
          const match = text.match(/\[.*"Title".*\]/s) || text.match(/\[.*"title".*"hot_value".*\]/s);
          if (match) {
            const hotData = JSON.parse(match[0]);
            hotData.slice(0, limit).forEach((item, i) => {
              items.push({
                rank: i + 1,
                title: item.Title || item.title || '',
                hot_value: item.HotValue || item.hot_value || 0,
                label: item.Label || item.label || '',
                url: cleanUrl(item.Url || item.url || '')
              });
            });
            if (items.length > 0) return {count: items.length, source: 'homepage_script', items};
          }
        } catch (e) {}
      }
    }

    // Method 3: Parse hot search links from DOM
    const hotLinks = doc.querySelectorAll('a[href*="search"], [class*="hot"] a, [class*="Hot"] a');
    for (const link of hotLinks) {
      const title = (link.textContent || '').trim();
      if (!title || title.length < 2 || title.length > 100) continue;
      if (items.some(it => it.title === title)) continue;
      items.push({
        rank: items.length + 1,
        title,
        hot_value: 0,
        label: '',
        url: cleanUrl(link.getAttribute('href') || '')
      });
      if (items.length >= limit) break;
    }

    if (items.length === 0) {
      return {error: 'Could not extract hot topics', hint: 'Open www.toutiao.com in bb-browser first and make sure you are logged in'};
    }

    return {count: items.length, source: 'homepage_dom', items};
  }
}
