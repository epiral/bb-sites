/* @meta
{
  "name": "facebook/marketplace-profile",
  "description": "列出 Facebook Marketplace 商家主页的全部在售商品。打开卖家弹窗（?ref=permalink），hook 住 fetch 捕获 MarketplaceSellerProfileInventoryListPaginationQuery 的响应，同时真实 wheel 事件触发分页，无限迭代直到连续 N 轮无新商品。需已登录 Facebook。",
  "domain": "www.facebook.com",
  "args": {
    "profileId": {"required": true, "description": "商家 Profile ID，例如 <SELLER_ID>"},
    "stableRounds": {"required": false, "description": "连续 N 轮无新增即视为到底（默认 6）"},
    "hardCeiling": {"required": false, "description": "安全上限轮次（默认 800）防死循环"}
  },
  "readOnly": true,
  "example": "bb-browser site facebook/marketplace-profile <SELLER_ID>"
}
*/
async function(args) {
  if (!args.profileId) return {error: 'Missing argument: profileId'};
  const stableRounds = parseInt(args.stableRounds || '6', 10);
  const hardCeiling = parseInt(args.hardCeiling || '800', 10);

  // 必须当前页已经是卖家 permalink 弹窗（因为 CDP 导航会销毁 eval 上下文）
  const onTarget = location.href.includes(`/marketplace/profile/${args.profileId}`) && location.href.includes('ref=permalink');
  if (!onTarget) {
    return {
      error: '请先手动打开卖家弹窗',
      hint: `bb-browser open "https://www.facebook.com/marketplace/profile/${args.profileId}/?ref=permalink" && sleep 6 && bb-browser site facebook/marketplace-profile ${args.profileId}`
    };
  }

  // 定位 dialog 内的滚动容器
  const pickScroller = () => {
    const scrollables = [...document.querySelectorAll('*')].filter(el => {
      const s = getComputedStyle(el);
      return (s.overflowY === 'auto' || s.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 50;
    });
    return scrollables.find(el => el.closest('[role="dialog"]')) || document.getElementById('scrollview');
  };
  let scroller = pickScroller();
  for (let i = 0; i < 5 && !scroller; i++) {
    await new Promise(r => setTimeout(r, 1000));
    scroller = pickScroller();
  }
  if (!scroller) return {error: '未找到弹窗滚动容器'};

  // Hook fetch 捕获分页响应，累积所有 listings
  const collected = new Map(); // id → full listing obj
  const captureListing = (l) => {
    if (!l || !l.id) return;
    const existing = collected.get(l.id) || {};
    collected.set(l.id, Object.assign(existing, {
      id: l.id,
      title: l.marketplace_listing_title || l.custom_title || existing.title,
      price: (l.listing_price && (l.listing_price.formatted_amount || l.listing_price.formatted_amount_zeros_stripped)) || existing.price,
      priceAmount: (l.listing_price && l.listing_price.amount) || existing.priceAmount,
      priceCurrency: (l.listing_price && l.listing_price.currency) || existing.priceCurrency,
      image: (l.primary_listing_photo && l.primary_listing_photo.image && l.primary_listing_photo.image.uri) || existing.image,
      seller: (l.marketplace_listing_seller && l.marketplace_listing_seller.name) || existing.seller,
      sellerId: (l.marketplace_listing_seller && l.marketplace_listing_seller.id) || existing.sellerId,
      location: l.location && l.location.reverse_geocode
        ? (l.location.reverse_geocode.city + ', ' + l.location.reverse_geocode.state)
        : existing.location,
      category: l.marketplace_listing_category_id || existing.category,
      deliveryTypes: l.delivery_types || existing.deliveryTypes || [],
      isSold: l.is_sold !== undefined ? l.is_sold : existing.isSold,
      isLive: l.is_live !== undefined ? l.is_live : existing.isLive,
      url: 'https://www.facebook.com/marketplace/item/' + l.id + '/'
    }));
  };
  const walkForListings = (obj) => {
    if (!obj || typeof obj !== 'object') return;
    if (Array.isArray(obj)) { obj.forEach(walkForListings); return; }
    // 节点命中：有 __typename=GroupCommerceProductItem 且有 id
    if (obj.__typename === 'GroupCommerceProductItem' && obj.id && (obj.marketplace_listing_title || obj.custom_title || obj.listing_price)) {
      captureListing(obj);
    }
    for (const k of Object.keys(obj)) walkForListings(obj[k]);
  };
  // 先从 SSR outerHTML 解析初始商品
  (() => {
    const html = document.documentElement.outerHTML;
    const marker = '"canonical_listing":{';
    let from = 0;
    while (true) {
      const idx = html.indexOf(marker, from);
      if (idx < 0) break;
      const start = idx + marker.length - 1;
      let depth = 0, inStr = false, esc = false, end = -1;
      for (let i = start; i < html.length; i++) {
        const c = html[i];
        if (esc) { esc = false; continue; }
        if (inStr) { if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
        if (c === '"') { inStr = true; continue; }
        if (c === '{') depth++;
        else if (c === '}') { depth--; if (depth === 0) { end = i; break; } }
      }
      if (end < 0) break;
      from = end + 1;
      try {
        const n = JSON.parse(html.substring(start, end + 1));
        if (n.marketplace_listing_seller && n.marketplace_listing_seller.id !== args.profileId) continue;
        captureListing(n);
      } catch (_) {}
    }
  })();

  // Monkey-patch fetch
  const origFetch = window.fetch;
  const pendingResponses = [];
  window.fetch = async function(...fetchArgs) {
    const resp = await origFetch.apply(this, fetchArgs);
    const url = (fetchArgs[0] && (fetchArgs[0].url || fetchArgs[0])) || '';
    if (typeof url === 'string' && url.includes('/api/graphql/')) {
      const body = fetchArgs[1] && fetchArgs[1].body;
      const bodyStr = typeof body === 'string' ? body : (body instanceof URLSearchParams ? body.toString() : '');
      if (bodyStr.includes('MarketplaceSellerProfileInventoryListPaginationQuery')) {
        const clone = resp.clone();
        pendingResponses.push(clone.text().then(t => {
          const lines = t.replace(/^for \(;;\);/, '').split('\n').filter(l => l.trim().startsWith('{'));
          for (const l of lines) {
            try { walkForListings(JSON.parse(l)); } catch (_) {}
          }
        }));
      }
    }
    return resp;
  };

  scroller.scrollTop = 0;
  await new Promise(r => setTimeout(r, 1500));

  const fire = () => {
    scroller.dispatchEvent(new WheelEvent('wheel', { deltaY: 1200, bubbles: true, cancelable: true }));
    scroller.scrollBy(0, 1200);
  };

  // 快速滚动：500ms/轮，用 DOM anchors 数量 + scrollHeight 判停
  const domCount = () => document.querySelectorAll('a[href*="marketplace_profile"]').length;
  let lastCount = 0, lastHeight = 0, stable = 0, rounds = 0;
  const deadline = Date.now() + 24000; // 留 6s 给结尾解析，避免 30s 超时
  while (rounds < hardCeiling && Date.now() < deadline) {
    rounds++;
    fire();
    await new Promise(r => setTimeout(r, 500));
    const curCount = domCount();
    const curHeight = scroller.scrollHeight;
    if (curCount === lastCount && curHeight === lastHeight) {
      stable++;
      if (stable >= stableRounds) break;
    } else {
      stable = 0;
      lastCount = curCount;
      lastHeight = curHeight;
    }
  }
  // 等所有已发 fetch 响应处理完
  if (pendingResponses.length) {
    await Promise.race([
      Promise.all(pendingResponses),
      new Promise(r => setTimeout(r, 2000))
    ]);
  }

  // 恢复 fetch
  window.fetch = origFetch;

  // DOM 兜底：任何在 DOM 里出现过但 collected 没抓到的商品，也补一个最小记录
  // 这样即使 fetch hook 没拿到（页面已提前加载完），也不会漏
  const domAnchors = [...document.querySelectorAll('a[href*="marketplace_profile"]')];
  for (const a of domAnchors) {
    const m = a.href.match(/\/marketplace\/item\/(\d+)/);
    if (!m) continue;
    const id = m[1];
    if (collected.has(id)) continue;
    const img = a.querySelector('img');
    const lines = (a.innerText || '').split('\n').map(s => s.trim()).filter(Boolean);
    // 价格在第一行（VEF xxx / $ xxx / Free），标题在第二行
    let price = null, title = null, location_ = null;
    const priceIdx = lines.findIndex(l => /^(VEF|USD|\$|Bs\.?|免费|Free)/i.test(l));
    if (priceIdx >= 0) {
      price = lines[priceIdx];
      title = lines[priceIdx + 1] || null;
      location_ = lines[priceIdx + 2] || null;
    }
    collected.set(id, {
      id, title, price,
      priceAmount: null, priceCurrency: null,
      image: img ? img.src : null,
      seller: null, sellerId: args.profileId,
      location: location_, category: null,
      deliveryTypes: [], isSold: false, isLive: true,
      url: 'https://www.facebook.com/marketplace/item/' + id + '/',
      source: 'dom'
    });
  }

  const items = [...collected.values()];
  // 过滤非本店铺（仅在 sellerId 已知时）
  const filtered = items.filter(i => !i.sellerId || i.sellerId === args.profileId);

  return {
    profileId: args.profileId,
    sellerName: filtered[0] && filtered[0].seller || null,
    count: filtered.length,
    scrollRounds: rounds,
    finalScrollHeight: lastHeight,
    items: filtered
  };
}
