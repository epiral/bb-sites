/* @meta
{
  "name": "m_weibo/hot",
  "description": "Get Weibo hot search / trending topics from mobile site",
  "domain": "m.weibo.cn",
  "args": {
    "count": {"required": false, "description": "Number of items to return (default: 30, max: 50)"}
  },
  "capabilities": ["network"],
  "readOnly": true,
  "example": "bb-browser site m_weibo/hot 20"
}
*/

async function(args) {
  const count = Math.min(parseInt(args.count) || 30, 50);

  // Use the mobile API for hot search
  const resp = await fetch('/api/container/getIndex?containerid=106003type%3D25%26t%3D3%26disable_hot%3D1%26filter_type%3Drealtimehot', {
    credentials: 'include',
    headers: {
      'MWeibo-Pwa': '1',
      'X-Requested-With': 'XMLHttpRequest'
    }
  });

  if (!resp.ok) return {error: 'HTTP ' + resp.status};
  const data = await resp.json();
  if (!data.ok) return {error: 'API error: ' + (data.msg || 'unknown')};

  // Find the card containing the hot search items (usually card_type 11)
  const cards = data.data?.cards || [];
  const items = [];
  
  for (const group of cards) {
    if (group.card_group) {
      for (const item of group.card_group) {
        if (item.desc || item.desc_extr) {
          items.push({
            word: item.desc || item.title_sub || '',
            rank: item.pic ? 0 : (items.length + 1), // 0 for top/pinned items
            hot_value: item.desc_extr || '',
            label: item.icon_desc || '',
            scheme: item.scheme,
            url: item.scheme ? (item.scheme.startsWith('http') ? item.scheme : 'https://m.weibo.cn/search?containerid=' + encodeURIComponent('100103type=1&q=' + (item.desc || ''))) : ''
          });
        }
      }
    }
  }

  return {
    count: Math.min(items.length, count),
    items: items.slice(0, count)
  };
}
