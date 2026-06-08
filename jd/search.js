/* @meta
{
  "name": "jd/search",
  "description": "Search products on JD.com (京东商品搜索: sku, name, price, sales, shop)",
  "domain": "search.jd.com",
  "args": {
    "query": {"required": true, "description": "Search keyword"},
    "count": {"required": false, "description": "Max results (default: 30)"}
  },
  "capabilities": ["network"],
  "readOnly": true,
  "example": "bb-browser site jd/search 机械键盘"
}
*/

async function(args) {
  if (!args.query) {
    return {error: 'Missing argument: query', hint: 'Provide a search keyword', action: 'bb-browser site jd/search "keyword"'};
  }

  const keyword = encodeURIComponent(args.query);
  const searchUrl = '/Search?keyword=' + keyword + '&enc=utf-8';

  // Fetch search page (same-origin, SSR includes product data in initial HTML)
  var resp;
  try {
    resp = await fetch(searchUrl, {credentials: 'include'});
  } catch (e) {
    return {error: 'Network error: ' + e.message, hint: 'Failed to fetch search results', action: 'bb-browser open https://search.jd.com'};
  }

  if (!resp.ok) {
    return {error: 'HTTP ' + resp.status, hint: 'Search request failed, try opening the site in browser', action: 'bb-browser open https://search.jd.com'};
  }

  var html = await resp.text();

  // Anti-bot detection
  if (html.indexOf('安全验证') !== -1 || html.indexOf('人机验证') !== -1
      || html.indexOf('anti_spider') !== -1 || html.indexOf('验证码') !== -1
      || (html.indexOf('probe') !== -1 && html.indexOf('data-sku') === -1)) {
    return {
      error: 'Anti-bot verification required',
      hint: 'Open JD.com in browser and complete verification first',
      action: 'bb-browser open https://www.jd.com'
    };
  }

  // Parse HTML with DOMParser (SSR page, product data in initial HTML)
  var doc = new DOMParser().parseFromString(html, 'text/html');
  var cards = doc.querySelectorAll('[data-sku]');

  if (cards.length === 0) {
    return {
      error: 'No products found',
      hint: 'Search returned no results or page structure has changed',
      action: 'bb-browser open https://search.jd.com/Search?keyword=' + keyword
    };
  }

  var maxCount = parseInt(args.count) || 30;
  var results = [];

  for (var i = 0; i < cards.length && results.length < maxCount; i++) {
    var card = cards[i];
    var sku = card.getAttribute('data-sku') || '';
    if (!sku || sku.length < 5) continue; // skip invalid SKUs

    // Name: try class-based selectors first, fallback to text parsing
    var name = '';
    var nameEl = card.querySelector('.p-name em')
              || card.querySelector('.p-name a')
              || card.querySelector('[class*="p-name"] em');
    if (nameEl) {
      name = nameEl.textContent.trim();
    }
    if (!name) {
      var lines = card.innerText.split('\n').filter(function(l) { return l.trim(); });
      for (var j = 0; j < lines.length; j++) {
        var candidate = lines[j].trim();
        if (candidate === '广告' || candidate === '京东自营') continue;
        if (candidate.length > 5) { name = candidate; break; }
      }
    }

    // Price: try class-based selectors first, fallback to regex
    var price = '';
    var priceEl = card.querySelector('.p-price strong')
              || card.querySelector('.p-price span')
              || card.querySelector('[class*="p-price"]');
    if (priceEl) {
      var priceMatch = priceEl.textContent.match(/(\d+\.?\d*)/);
      if (priceMatch) price = priceMatch[1];
    }
    if (!price) {
      var m = card.innerText.match(/¥\s*(\d+\.?\d*)/);
      if (m) price = m[1];
    }

    // Sales: from commit section or text pattern
    var sales = '';
    var commitEl = card.querySelector('.p-commit');
    if (commitEl) {
      var salesMatch = commitEl.textContent.match(/(\d+[万+]?)\s*条/);
      if (salesMatch) sales = salesMatch[1];
    }
    if (!sales) {
      var sm = card.innerText.match(/已售(\d+[万+]?)/);
      if (sm) sales = sm[1];
    }

    // Shop: try class-based selector first, fallback to bottom-up text scan
    var shop = '';
    var shopEl = card.querySelector('.p-shop a span')
             || card.querySelector('.p-shop a')
             || card.querySelector('[class*="p-shop"] a');
    if (shopEl) {
      shop = shopEl.textContent.trim();
    }
    if (!shop) {
      var skipPatterns = [/^\d+$/, /¥/, /已售/, /到手价/, /券/, /已减/, /人种草/, /人看过/, /飙升/, /加购/, /好评榜/, /补贴/, /PLUS/, /直降/, /条评价/];
      var allLines = card.innerText.split('\n').filter(function(l) { return l.trim(); });
      for (var k = allLines.length - 1; k >= 0; k--) {
        var line = allLines[k].trim();
        if (line && !skipPatterns.some(function(p) { return p.test(line); })) {
          shop = line;
          break;
        }
      }
    }

    results.push({
      sku: sku,
      name: name,
      price: price,
      sales: sales,
      shop: shop,
      url: 'https://item.jd.com/' + sku + '.html'
    });
  }

  return {
    query: args.query,
    total: cards.length,
    returned: results.length,
    results: results
  };
}
