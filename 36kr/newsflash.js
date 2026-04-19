/* @meta
{
  "name": "36kr/newsflash",
  "description": "36氪快讯 (tech news flash: title, description, timestamp)",
  "domain": "36kr.com",
  "args": {
    "count": {"required": false, "description": "Number of items to return (default: 20, max: 50)"}
  },
  "capabilities": ["network"],
  "readOnly": true,
  "example": "bb-browser site 36kr/newsflash"
}
*/

async function(args) {
  const count = Math.min(parseInt(args.count) || 20, 50);

  // 36kr gateway API: POST with JSON body
  const resp = await fetch('https://gateway.36kr.com/api/mis/nav/newsflash/flow', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    credentials: 'include',
    body: JSON.stringify({
      partner_id: 'web',
      param: {siteId: 1, platformId: 2, pageSize: count, pageEvent: 0},
      timestamp: Date.now()
    })
  });

  if (!resp.ok) {
    // Fallback: parse SSR page
    const pageResp = await fetch('https://36kr.com/newsflashes', {credentials: 'include'});
    if (!pageResp.ok) return {error: 'HTTP ' + pageResp.status, hint: 'Navigate to 36kr.com first'};
    const html = await pageResp.text();
    const match = html.match(/window\.initialState\s*=\s*(\{.*?\});?\s*<\/script/s);
    if (!match) return {error: 'Failed to parse page data'};
    try {
      const state = JSON.parse(match[1]);
      const list = state.newsflashCatalogData?.data?.newsflashList?.data?.itemList
                || state.newsflashCatalogData?.newsflashList?.itemList
                || [];
      const items = list.slice(0, count).map((item, i) => {
        const m = item.templateMaterial || {};
        return {
          rank: i + 1,
          id: String(item.itemId),
          title: m.widgetTitle || '',
          description: (m.widgetContent || '').substring(0, 500),
          timestamp: m.publishTime ? new Date(m.publishTime).toISOString() : null,
          url: 'https://36kr.com/newsflashes/' + item.itemId
        };
      });
      return {count: items.length, items, source: 'ssr_fallback'};
    } catch (e) {
      return {error: 'JSON parse failed: ' + e.message};
    }
  }

  const data = await resp.json();
  if (data.code !== 0) return {error: 'API error: ' + (data.msg || data.code)};

  const list = (data.data && data.data.itemList) || [];
  const items = list.slice(0, count).map((item, i) => {
    const m = item.templateMaterial || {};
    return {
      rank: i + 1,
      id: String(item.itemId),
      title: m.widgetTitle || '',
      description: (m.widgetContent || '').substring(0, 500),
      timestamp: m.publishTime ? new Date(m.publishTime).toISOString() : null,
      url: 'https://36kr.com/newsflashes/' + item.itemId
    };
  });

  return {count: items.length, items};
}
