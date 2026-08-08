/* @meta
{
  "name": "jd/product-detail",
  "description": "Get JD.com product details (京东商品详情: title, price, shop, reviews, url)",
  "domain": "item.jd.com",
  "args": {
    "sku": {"required": true, "description": "Product SKU number"}
  },
  "capabilities": ["network"],
  "readOnly": true,
  "example": "bb-browser site jd/product-detail 100002692274"
}
*/

async function(args) {
  if (!args.sku) {
    return {error: 'Missing argument: sku', hint: 'Provide a product SKU number', action: 'bb-browser site jd/search "keyword" to find SKU'};
  }

  var sku = args.sku;
  var targetUrl = '/' + sku + '.html';

  // Fetch product page (same-origin, SSR)
  var resp;
  try {
    resp = await fetch(targetUrl, {credentials: 'include'});
  } catch (e) {
    return {error: 'Network error: ' + e.message, hint: 'Failed to fetch product page', action: 'bb-browser open https://item.jd.com/' + sku + '.html'};
  }

  if (!resp.ok) {
    return {error: 'HTTP ' + resp.status, hint: 'Product page request failed', action: 'bb-browser open https://item.jd.com/' + sku + '.html'};
  }

  var html = await resp.text();

  // Anti-bot detection
  if (html.indexOf('安全验证') !== -1 || html.indexOf('人机验证') !== -1
      || html.indexOf('anti_spider') !== -1 || html.indexOf('验证码') !== -1
      || (html.indexOf('probe') !== -1 && html.indexOf('sku-name') === -1)) {
    return {
      error: 'Anti-bot verification required',
      hint: 'Open JD.com in browser and complete verification first',
      action: 'bb-browser open https://www.jd.com'
    };
  }

  var doc = new DOMParser().parseFromString(html, 'text/html');

  // Name: multiple selector fallbacks for various JD page layouts
  var nameEl = doc.querySelector('[class*="sku-name"]')
            || doc.querySelector('.itemInfo-wrap .sku-name')
            || doc.querySelector('#name h1')
            || doc.querySelector('.itemTitle');
  var name = nameEl ? nameEl.textContent.trim() : '';
  if (!name) {
    var titleText = doc.title;
    var titleMatch = titleText.match(/^(.+?)[-—|【】\/]/);
    if (titleMatch) name = titleMatch[1].trim();
  }

  // Price: try p.3.cn API first (known JD price endpoint), fallback to HTML parsing
  var price = '';
  try {
    var priceResp = await fetch('https://p.3.cn/prices/mgets?skuIds=' + sku, {credentials: 'include'});
    if (priceResp.ok) {
      var priceData = await priceResp.json();
      if (priceData && priceData.length > 0 && priceData[0].p) {
        price = priceData[0].p;
      }
    }
  } catch (e) {
    // p.3.cn may be blocked by CORS, fall through to HTML parsing
  }

  if (!price) {
    var priceEl = doc.querySelector('[class*="p-price"]')
               || doc.querySelector('.item-price')
               || doc.querySelector('#jd-price');
    if (priceEl) {
      price = priceEl.textContent.trim().replace(/[^0-9.]/g, '');
    }
  }
  if (!price) {
    var pm = html.match(/¥\s*(\d+\.\d+)/);
    if (pm) price = pm[1];
  }

  var shopEl = doc.querySelector('[class*="J-hove-wrap"]')
            || doc.querySelector('[class*="shop-name"]')
            || doc.querySelector('.item-shop');
  var shop = shopEl ? shopEl.textContent.trim() : '';

  var commentEl = doc.querySelector('#comment-count')
               || doc.querySelector('[class*="comment-count"]')
               || doc.querySelector('[class*="J-comment-count"]');
  var commentCount = commentEl ? commentEl.textContent.trim() : '';
  if (!commentCount) {
    var cm = html.match(/(\d+[万+]?)\s*条?评价/);
    if (cm) commentCount = cm[1];
  }

  if (!name && !price) {
    return {
      error: 'Failed to extract product info',
      hint: 'Page structure may have changed or product does not exist',
      action: 'bb-browser open https://item.jd.com/' + sku + '.html'
    };
  }

  return {
    sku: sku,
    name: name,
    price: price,
    shop: shop,
    commentCount: commentCount,
    url: 'https://item.jd.com/' + sku + '.html'
  };
}
