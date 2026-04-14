/* @meta
{
  "name": "facebook/marketplace-item",
  "description": "获取 Facebook Marketplace 单个商品的详情（标题/价格/描述/全部图片/卖家/位置）。从 SSR JSON 解析，含 listing_photos 全图。需已登录 Facebook。",
  "domain": "www.facebook.com",
  "args": {
    "itemId": {"required": true, "description": "商品 ID，例如 <ITEM_ID>"}
  },
  "readOnly": true,
  "example": "bb-browser site facebook/marketplace-item <ITEM_ID>"
}
*/
async function(args) {
  if (!args.itemId) return {error: 'Missing argument: itemId'};

  const targetUrl = `https://www.facebook.com/marketplace/item/${args.itemId}/`;
  if (!location.href.includes(`/marketplace/item/${args.itemId}`)) {
    return { error: '请先 bb-browser open 目标商品 URL', hint: `bb-browser open "${targetUrl}" && sleep 5 && bb-browser site facebook/marketplace-item ${args.itemId}` };
  }

  const html = document.documentElement.outerHTML;

  // 括号平衡解析器
  const parseObjAt = (start) => {
    let depth = 0, inStr = false, esc = false;
    for (let i = start; i < html.length; i++) {
      const c = html[i];
      if (esc) { esc = false; continue; }
      if (inStr) {
        if (c === '\\') { esc = true; continue; }
        if (c === '"') { inStr = false; continue; }
        continue;
      }
      if (c === '"') { inStr = true; continue; }
      if (c === '{') depth++;
      else if (c === '}') { depth--; if (depth === 0) { try { return JSON.parse(html.substring(start, i + 1)); } catch (_) { return null; } } }
    }
    return null;
  };
  const parseArrAt = (start) => {
    let depth = 0, inStr = false, esc = false;
    for (let i = start; i < html.length; i++) {
      const c = html[i];
      if (esc) { esc = false; continue; }
      if (inStr) {
        if (c === '\\') { esc = true; continue; }
        if (c === '"') { inStr = false; continue; }
        continue;
      }
      if (c === '"') { inStr = true; continue; }
      if (c === '[') depth++;
      else if (c === ']') { depth--; if (depth === 0) { try { return JSON.parse(html.substring(start, i + 1)); } catch (_) { return null; } } }
    }
    return null;
  };

  const findFirst = (key, isArray) => {
    const marker = '"' + key + '":' + (isArray ? '[' : '{');
    const idx = html.indexOf(marker);
    if (idx < 0) return null;
    const start = idx + marker.length - 1;
    return isArray ? parseArrAt(start) : parseObjAt(start);
  };

  // 目标字段
  const target = findFirst('marketplace_listing_renderable_target', false);
  const photos = findFirst('listing_photos', true) || [];
  const desc = findFirst('redacted_description', false);
  const seller = findFirst('marketplace_listing_seller', false);

  // 定位 listing_price（商品详情页常用 formatted_amount_zeros_stripped）
  let price = null;
  let searchIdx = 0;
  const marker = '"listing_price":{';
  while (true) {
    const idx = html.indexOf(marker, searchIdx);
    if (idx < 0) break;
    const obj = parseObjAt(idx + marker.length - 1);
    searchIdx = idx + marker.length;
    if (obj && (obj.formatted_amount || obj.formatted_amount_zeros_stripped || obj.currency)) {
      price = obj;
      break;
    }
  }

  // title / price 是字符串或嵌套对象，上面 findFirst 仅支持 obj/arr。单独处理字符串字段
  const strField = (key) => {
    const m = html.match(new RegExp('"' + key + '":"((?:[^"\\\\]|\\\\.)*)"'));
    return m ? JSON.parse('"' + m[1] + '"') : null;
  };

  return {
    id: args.itemId,
    url: targetUrl,
    title: strField('marketplace_listing_title') || strField('custom_title'),
    price: price ? (price.formatted_amount || price.formatted_amount_zeros_stripped || null) : null,
    priceAmount: price && price.amount || null,
    priceCurrency: price && price.currency || null,
    description: (desc && desc.text) || strField('redacted_description'),
    seller: seller && {id: seller.id, name: seller.name, type: seller.__typename},
    location: target && target.location && target.location.reverse_geocode
      ? {
          city: target.location.reverse_geocode.city,
          state: target.location.reverse_geocode.state,
          latitude: target.location.latitude,
          longitude: target.location.longitude
        }
      : null,
    shippingOffered: target ? !!target.is_shipping_offered : null,
    images: photos.map(p => p.image && p.image.uri).filter(Boolean),
    imageCount: photos.length,
    imageDetails: photos.map(p => ({
      uri: p.image && p.image.uri,
      width: p.image && p.image.width,
      height: p.image && p.image.height,
      caption: p.accessibility_caption
    }))
  };
}
