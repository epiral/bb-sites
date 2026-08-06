/* @meta
{
  "name": "aliexpress/search-product",
  "description": "速卖通商品搜索 - 按关键词搜索AliExpress商品 (product search: title, price, rating, soldCount, url)",
  "domain": "aliexpress.com",
  "args": {
    "keyword": {"required": true, "description": "搜索关键词，如 'phone'、'smart watch'、'headphone'"},
    "priceMin": {"required": false, "description": "最低价格（美元），如 10"},
    "priceMax": {"required": false, "description": "最高价格（美元），如 100"}
  },
  "tags": ["ecommerce", "aliexpress", "search", "products", "read-only"],
  "readOnly": true,
  "example": "bb-browser site aliexpress/search-product --keyword phone"
}
*/

async function(args) {
  var keyword = (args.keyword || '').trim();
  if (!keyword) {
    return {
      error: '缺少必填参数: keyword（搜索关键词）',
      hint: '请输入要搜索的商品关键词，例如：phone、smart watch、headphone',
      action: 'bb-browser site aliexpress/search-product --keyword phone'
    };
  }

  var priceMin = args.priceMin !== undefined ? parseFloat(args.priceMin) : null;
  var priceMax = args.priceMax !== undefined ? parseFloat(args.priceMax) : null;

  // ===== Helpers =====

  var normUrl = function(url) {
    if (!url) return '';
    if (url.startsWith('//')) return 'https:' + url;
    if (url.startsWith('/')) return 'https:' + url;
    return url;
  };

  var parsePrice = function(str) {
    if (!str) return null;
    var m = String(str).replace(/,/g, '').match(/[\d.]+/);
    return m ? parseFloat(m[0]) : null;
  };

  var parseIntVal = function(str) {
    if (!str) return 0;
    var m = String(str).replace(/,/g, '').match(/([\d.]+)([kK万wW]?)/);
    if (!m) return 0;
    var num = parseFloat(m[1]);
    if (m[2] && (m[2].toLowerCase() === 'k' || m[2] === '万' || m[2] === 'w')) return Math.round(num * 1000);
    return Math.round(num);
  };

  var applyPriceFilter = function(products) {
    var filtered = products;
    if (priceMin !== null) filtered = filtered.filter(function(p) { return p.price === null || p.price >= priceMin; });
    if (priceMax !== null) filtered = filtered.filter(function(p) { return p.price === null || p.price <= priceMax; });
    return filtered;
  };

  // ===== JSON Extraction =====

  var extractProductsFromJson = function(data) {
    var items = [];
    var paths = [
      data.itemList || data.items,
      data.data && (data.data.itemList || data.data.items),
      data.data && data.data.searchResult && (data.data.searchResult.itemList || data.data.searchResult.items),
      data.data && data.data.products,
      data.products,
      data.pageInfo && data.pageInfo.itemList,
      data.result && (data.result.itemList || data.result.items),
      data.data && data.data.list,
      data.list,
      data.data && data.data.data && (data.data.data.itemList || data.data.data.products)
    ];
    for (var i = 0; i < paths.length; i++) {
      if (Array.isArray(paths[i]) && paths[i].length > 0) {
        items = paths[i];
        break;
      }
    }

    if (items.length === 0) return [];

    var products = [];
    var seen = {};

    for (var i = 0; i < items.length; i++) {
      try {
        var item = items[i];
        var itemId = item.itemId || item.id || item.productId || item.skuId || item.iid || '';
        var url = itemId ? 'https://www.aliexpress.com/item/' + itemId + '.html' : (item.url || item.productUrl || '');

        var title = (item.title || item.name || item.productTitle || item.subject || '').replace(/<\/?[^>]+>/g, '').replace(/\s+/g, ' ').trim();
        if (!title) continue;

        var key = itemId || title;
        if (seen[key]) continue;
        seen[key] = true;

        var price = item.price || item.productPrice || item.minPrice || item.offerPrice || item.viewPrice || null;
        if (typeof price === 'string') price = parsePrice(price);

        var listPrice = item.listPrice || item.originalPrice || item.maxPrice || null;
        if (typeof listPrice === 'string') listPrice = parsePrice(listPrice);
        if (listPrice === price) listPrice = null;

        var discount = item.discount || item.discountRate || null;
        if (discount === null && price !== null && listPrice !== null && listPrice > price) {
          discount = Math.round((1 - price / listPrice) * 100);
        }

        var rating = item.rating || item.averageRating || item.starRating || null;
        if (typeof rating === 'string') rating = parseFloat(rating);

        var soldCount = item.soldCount || item.sold || item.saleCount || item.tradeCount || item.orderCount || item.historySaleCount || 0;
        if (typeof soldCount === 'string') soldCount = parseIntVal(soldCount);

        var image = item.image || item.img || item.picUrl || item.pictureUrl || item.imageUrl || item.productImage || '';
        if (typeof image === 'object' && image !== null) image = image.url || '';
        if (image && !image.startsWith('http')) image = 'https:' + image;

        // Skip if doesn't match price filter
        if (priceMin !== null && price !== null && price < priceMin) continue;
        if (priceMax !== null && price !== null && price > priceMax) continue;

        products.push({
          title: title,
          price: price,
          listPrice: listPrice,
          discount: discount,
          rating: rating,
          soldCount: soldCount,
          url: normUrl(url),
          image: image
        });
      } catch(e) {}
    }

    return products;
  };

  // ===== Build search URL =====

  var searchUrl = 'https://www.aliexpress.com/w/wholesale-' + encodeURIComponent(keyword) + '.html?g=y&SearchText=' + encodeURIComponent(keyword);
  if (priceMin !== null) searchUrl += '&minPrice=' + priceMin;
  if (priceMax !== null) searchUrl += '&maxPrice=' + priceMax;

  // =====================================================
  // Strategy 1: Fetch and parse HTML / embedded JSON
  // =====================================================

  try {
    var resp = await fetch(searchUrl, {
      credentials: 'include',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7'
      }
    });

    if (resp.ok) {
      var html = await resp.text();

      // Check if we got redirected to login
      var isLogin = html.indexOf('login') !== -1 && (html.indexOf('sign') !== -1 || html.indexOf('Register/Sign') !== -1);
      if (!isLogin) {
        // Try to find embedded JSON
        var parser = new DOMParser();
        var doc = parser.parseFromString(html, 'text/html');
        var scripts = doc.querySelectorAll('script');
        var jsonData = null;

        for (var si = 0; si < scripts.length; si++) {
          var text = scripts[si].textContent || '';
          if (text.indexOf('INITIAL_STATE') !== -1) {
            var m = text.match(/window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\});/);
            if (m) {
              try { jsonData = JSON.parse(m[1]); break; } catch(e) {}
            }
          }
          if (!jsonData && text.indexOf('itemList') !== -1) {
            var m = text.match(/"itemList"\s*:\s*(\[[\s\S]*?\])\s*[,}]/);
            if (m) {
              try { jsonData = JSON.parse('{"itemList":' + m[1] + '}'); break; } catch(e) {}
            }
          }
          if (!jsonData && text.indexOf('products') !== -1) {
            var m = text.match(/"products"\s*:\s*(\[[\s\S]*?\])\s*[,}]/);
            if (m) {
              try { jsonData = JSON.parse('{"products":' + m[1] + '}'); break; } catch(e) {}
            }
          }
          if (!jsonData && text.indexOf('window.__data__') !== -1) {
            var m = text.match(/window\.__data__\s*=\s*(\{[\s\S]*?\});/);
            if (m) {
              try { jsonData = JSON.parse(m[1]); break; } catch(e) {}
            }
          }
          if (!jsonData && text.indexOf('__NUXT__') !== -1) {
            var m = text.match(/window\.__NUXT__\s*=\s*(\{[\s\S]*?\});/);
            if (m) {
              try { jsonData = JSON.parse(m[1]); break; } catch(e) {}
            }
          }
        }

        if (jsonData) {
          var products = extractProductsFromJson(jsonData);
          if (products.length > 0) {
            var total = jsonData.totalCount || jsonData.total || jsonData.totalResults || products.length;
            return {keyword: keyword, totalResults: total, products: products, source: 'fetch_json'};
          }
        }

        // Parse DOM for product items
        var products = [];
        var seenIds = {};

        var productEls = doc.querySelectorAll(
          'a[href*="/item/"], div[class*="product"], li[class*="product"], ' +
          'div[class*="card"], div[class*="Card"], [class*="search-item"], [class*="SearchItem"]'
        );

        if (productEls.length === 0) {
          productEls = doc.querySelectorAll('a[href*="aliexpress.com/item/"]');
        }

        productEls.forEach(function(el) {
          var linkEl = el.tagName === 'A' ? el : el.querySelector('a[href*="/item/"]');
          if (!linkEl) return;

          var url = linkEl.getAttribute('href') || '';
          if (url.indexOf('/item/') === -1 && url.indexOf('product') === -1) return;
          url = normUrl(url);

          var titleEl = linkEl.querySelector('[class*="title"], [class*="Title"], [class*="name"], [class*="Name"], h3') || linkEl;
          var title = (titleEl.textContent || titleEl.getAttribute('title') || '').replace(/<\/?[^>]+>/g, '').replace(/\s+/g, ' ').trim();
          if (!title || title.length < 3) return;

          var idMatch = url.match(/\/item\/(\d+)/);
          var itemId = idMatch ? idMatch[1] : title;
          if (seenIds[itemId]) return;
          seenIds[itemId] = true;

          var priceEl = el.querySelector('[class*="price"], [class*="Price"]');
          var price = null;
          var listPrice = null;
          if (priceEl) {
            var priceText = (priceEl.textContent || '').trim();
            var prices = priceText.match(/\$?[\d,.]+/g);
            if (prices) {
              price = parsePrice(prices[0]);
              if (prices.length > 1) listPrice = parsePrice(prices[prices.length - 1]);
            }
          }

          var discount = null;
          if (price !== null && listPrice !== null && listPrice > price) {
            discount = Math.round((1 - price / listPrice) * 100);
          }

          var ratingEl = el.querySelector('[class*="rating"], [class*="Rating"]');
          var rating = null;
          if (ratingEl) {
            var r = (ratingEl.textContent || '').trim().match(/([\d.]+)/);
            if (r) rating = parseFloat(r[1]);
          }

          var soldEl = el.querySelector('[class*="sold"], [class*="order"]');
          var soldCount = 0;
          if (soldEl) soldCount = parseIntVal(soldEl.textContent);

          var imgEl = el.querySelector('img');
          var image = '';
          if (imgEl) {
            image = normUrl(imgEl.getAttribute('src') || imgEl.getAttribute('data-src') || imgEl.getAttribute('data-original') || '');
          }

          products.push({
            title: title,
            price: price,
            listPrice: listPrice,
            discount: discount,
            rating: rating,
            soldCount: soldCount,
            url: url,
            image: image
          });
        });

        if (products.length > 0) {
          var filtered = applyPriceFilter(products);
          return {keyword: keyword, totalResults: filtered.length, products: filtered, source: 'fetch_dom'};
        }
      }
    }
  } catch(e) {
    // Fall through
  }

  // =====================================================
  // Strategy 2: Try the aexapi endpoint
  // =====================================================

  try {
    var apiUrl = 'https://www.aliexpress.com/aexapi/v1/product/search?q=' + encodeURIComponent(keyword) + '&page=1&size=20&sort=default';
    var apiResp = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.aliexpress.com/'
      }
    });

    if (apiResp.ok) {
      var apiData = await apiResp.json();
      var products = [];
      if (Array.isArray(apiData)) {
        products = extractProductsFromJson({items: apiData});
      } else if (apiData.data) {
        products = extractProductsFromJson(apiData.data);
      } else if (apiData.result) {
        products = extractProductsFromJson(apiData.result);
      } else {
        products = extractProductsFromJson(apiData);
      }

      if (products.length > 0) {
        var total = apiData.totalCount || apiData.total || apiData.totalResults || products.length;
        return {keyword: keyword, totalResults: total, products: products, source: 'api'};
      }
    }
  } catch(e) {
    // Fall through
  }

  // =====================================================
  // Strategy 3: Try mtop API
  // =====================================================

  try {
    var mtopUrl = 'https://acs.aliexpress.com/h5/mtop.aliexpress.data.search/1.0/?jsv=2.5.1&appKey=12574478&t=' + Date.now() + '&api=mtop.aliexpress.data.search&v=1.0&timeout=10000&type=jsonp&dataType=jsonp';
    var mtopResp = await fetch(mtopUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Referer': 'https://www.aliexpress.com/'
      }
    });

    if (mtopResp.ok) {
      var mtopData = await mtopResp.text();
      // Mtop returns JSONP - try to extract
      var jsonpMatch = mtopData.match(/mtopjsonp\d+\((.+)\)/);
      if (jsonpMatch) {
        try {
          var parsed = JSON.parse(jsonpMatch[1]);
          var products = extractProductsFromJson(parsed.data || parsed);
          if (products.length > 0) {
            return {keyword: keyword, totalResults: products.length, products: products, source: 'mtop_api'};
          }
        } catch(e) {}
      }
    }
  } catch(e) {
    // Fall through
  }

  // =====================================================
  // Strategy 4: Browser DOM extraction (when running in browser)
  // =====================================================

  try {
    var browserCards = document.querySelectorAll(
      'a[href*="/item/"], a[href*="aliexpress.com/item"]'
    );

    if (browserCards.length > 0) {
      var products = [];
      var seen = {};

      browserCards.forEach(function(el) {
        var href = el.getAttribute('href') || '';
        var url = normUrl(href);
        if (url.indexOf('/item/') === -1) return;

        var title = (el.textContent || el.getAttribute('title') || '').replace(/\s+/g, ' ').trim();
        if (!title || title.length < 3) return;

        if (seen[url]) return;
        seen[url] = true;

        var card = el.closest('[class*="card"], [class*="Card"], [class*="item"], [class*="Item"], [class*="product"], [class*="Product"]') || el.parentElement;

        var price = null;
        var listPrice = null;
        var discount = null;
        var rating = null;
        var soldCount = 0;
        var image = '';

        if (card) {
          var priceEl = card.querySelector('[class*="price"], [class*="Price"]');
          if (priceEl) {
            var priceText = (priceEl.textContent || '').trim();
            var prices = priceText.match(/\$?[\d,.]+/g);
            if (prices) {
              price = parsePrice(prices[0]);
              if (prices.length > 1) listPrice = parsePrice(prices[prices.length - 1]);
            }
          }

          if (price !== null && listPrice !== null && listPrice > price) {
            discount = Math.round((1 - price / listPrice) * 100);
          }

          var ratingEl = card.querySelector('[class*="rating"], [class*="Rating"]');
          if (ratingEl) {
            var r = (ratingEl.textContent || '').trim().match(/([\d.]+)/);
            if (r) rating = parseFloat(r[1]);
          }

          var soldEl = card.querySelector('[class*="sold"], [class*="order"]');
          if (soldEl) soldCount = parseIntVal(soldEl.textContent);

          var imgEl = card.querySelector('img');
          if (imgEl) {
            image = normUrl(imgEl.getAttribute('src') || imgEl.getAttribute('data-src') || '');
          }
        }

        products.push({
          title: title,
          price: price,
          listPrice: listPrice,
          discount: discount,
          rating: rating,
          soldCount: soldCount,
          url: url,
          image: image
        });
      });

      if (products.length > 0) {
        var filtered = applyPriceFilter(products);
        return {keyword: keyword, totalResults: filtered.length, products: filtered, source: 'browser_dom'};
      }
    }
  } catch(e) {
    // Fall through
  }

  // =====================================================
  // All strategies failed
  // =====================================================

  return {
    keyword: keyword,
    totalResults: 0,
    products: [],
    error: '无法获取AliExpress搜索结果',
    hint: 'AliExpress 有强反爬机制，需要代理或登录后才能访问搜索结果。\n\n' +
           '请尝试以下步骤：\n' +
           '1. 确保使用支持AliExpress的代理（美国/欧洲IP）\n' +
           '2. 在浏览器中打开 aliexpress.com 并登录账号\n' +
           '3. 重新运行搜索命令\n\n' +
           '如果仍无法获取，可能是AliExpress页面结构已更新，需要更新解析逻辑。',
    action: 'bb-browser open https://www.aliexpress.com\n然后在浏览器中登录，再运行：\nbb-browser site aliexpress/search-product --keyword ' + encodeURIComponent(keyword),
    debug: {keyword: keyword, priceMin: priceMin, priceMax: priceMax}
  };
}
