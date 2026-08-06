/* @meta
{
  "name": "jd/search-products",
  "description": "京东商品搜索 - 按关键词搜索京东商品 (product search: title, price, isJDSelfOperated, reviewCount, goodRate, shopName, url)",
  "domain": "search.jd.com",
  "args": {
    "keyword": {"required": true, "description": "搜索关键词，如'手机'、'笔记本电脑'"},
    "priceMin": {"required": false, "description": "最低价格（元），如 1000"},
    "priceMax": {"required": false, "description": "最高价格（元），如 5000"},
    "sort": {"required": false, "description": "排序方式: default(综合), price_asc(价格从低到高), price_desc(价格从高到低), sales(销量), review(评价), new(新品)"}
  },
  "tags": ["ecommerce", "jd", "jingdong", "search", "products"],
  "readOnly": true,
  "example": "bb-browser site jd/search-products 手机"
}
*/

async function(args) {
  if (!args.keyword) {
    return {
      error: '缺少必填参数: keyword',
      hint: '请输入搜索关键词，例如：bb-browser site jd/search-products 手机',
      action: 'bb-browser site jd/search-products <搜索关键词>'
    };
  }

  var keyword = args.keyword.trim();
  var priceMin = args.priceMin ? parseFloat(args.priceMin) : null;
  var priceMax = args.priceMax ? parseFloat(args.priceMax) : null;
  var sort = args.sort || 'default';

  // Build search URL
  var url = 'https://search.jd.com/Search?keyword=' + encodeURIComponent(keyword) + '&enc=utf-8';

  // Optional price filter params
  if (priceMin !== null || priceMax !== null) {
    var priceRange = '';
    if (priceMin !== null) priceRange += priceMin;
    priceRange += '-';
    if (priceMax !== null) priceRange += priceMax;
    url += '&wq=' + encodeURIComponent(keyword) + '&ev=exprice_' + priceRange;
  }

  // Sort parameter
  var sortMap = {
    'default': '',
    'price_asc': '&psort=1',
    'price_desc': '&psort=2',
    'sales': '&psort=3',
    'review': '&psort=4',
    'new': '&psort=5'
  };
  if (sortMap[sort]) {
    url += sortMap[sort];
  }

  // ────────────────────────────────────────────
  // PARSE FUNCTION (reusable for both code paths)
  // ────────────────────────────────────────────
  function parseSearchResults(doc, baseUrl) {
    var products = [];
    var totalResults = 0;

    // Find product cards — updated selector for 2026 JD redesign (CSS Modules)
    var cards = doc.querySelectorAll('[class*="plugin_goodsCardWrapper"]');
    if (cards.length === 0) {
      // Fallback: try older selectors
      cards = doc.querySelectorAll('#J_goodsList .gl-item, .goods-list .gl-item, [class*="goodsCard"]');
    }

    cards.forEach(function(card) {
      try {
        // Title
        var titleEl = card.querySelector('[class*="_goods_title_container"]');
        if (!titleEl) {
          titleEl = card.querySelector('.p-name a, .p-name em');
        }
        if (!titleEl) return;
        var title = (titleEl.textContent || titleEl.getAttribute('title') || '').trim();
        if (!title) return;

        // Price — find the price element
        var price = 0;
        var priceEl = card.querySelector('[class*="price"], [class*="Price"]');
        if (!priceEl) {
          priceEl = card.querySelector('.p-price strong, .p-price i, .p-price');
        }
        if (priceEl) {
          var priceText = priceEl.textContent.trim();
          var pm = priceText.match(/([\d,]+\.?\d{0,2})/);
          if (pm) price = parseFloat(pm[1].replace(/,/g, ''));
        }

        // Extract data from chat.jd.com link parameters (reliable source)
        var pid = '', reviewCount = 0, goodRate = '', shopName = '';
        var linkEl = card.querySelector('a[href*="chat.jd.com"]');
        if (linkEl) {
          try {
            var linkUrl = new URL(linkEl.href);
            pid = linkUrl.searchParams.get('pid') || '';
            shopName = decodeURIComponent(linkUrl.searchParams.get('seller') || '');
            var rate = linkUrl.searchParams.get('evaluationRate');
            if (rate) goodRate = rate + '%';

            // commentNum: may be "200万+" or "500+", double-encoded
            var commentNum = linkUrl.searchParams.get('commentNum') || '';
            if (commentNum) {
              // URL parameters come single-decoded by URL.searchParams;
              // JD sometimes double-encodes → decode once more
              try {
                var decoded = decodeURIComponent(commentNum);
                // If decode succeeded and looks different, use it
                if (decoded !== commentNum) commentNum = decoded;
              } catch(_) {}
              if (commentNum.indexOf('万') !== -1) {
                reviewCount = Math.round(parseFloat(commentNum) * 10000);
              } else {
                reviewCount = parseInt(commentNum) || 0;
              }
            }
          } catch(_) {}
        }

        // Fallback: parse review from DOM text
        if (reviewCount === 0) {
          var reviewEl = card.querySelector('[class*="commit"], [class*="comment"], .p-commit a');
          if (reviewEl) {
            var reviewText = reviewEl.textContent.trim();
            var reviewMatch = reviewText.match(/(\d+\.?\d*)(万\+?|\+)?\s*条评价/);
            if (reviewMatch) {
              if (reviewMatch[2] && reviewMatch[2].indexOf('万') !== -1) {
                reviewCount = Math.round(parseFloat(reviewMatch[1]) * 10000);
              } else {
                reviewCount = parseInt(reviewMatch[1]) || 0;
              }
            }
          }
        }

        // Fallback: parse shop from DOM
        if (!shopName) {
          var shopEl = card.querySelector('[class*="_name_"], .p-shop a');
          if (shopEl) shopName = (shopEl.textContent || '').trim();
        }

        // Self-operated
        var isSelf = card.textContent.indexOf('自营') !== -1;
        // More precise check via image alt
        if (!isSelf) {
          var selfImg = card.querySelector('img[alt="自营"]');
          if (selfImg) isSelf = true;
        }

        // Image
        var imgEl = card.querySelector('img[src*="360buyimg"], .p-img img');
        var imgUrl = '';
        if (imgEl) {
          imgUrl = imgEl.getAttribute('src') || imgEl.getAttribute('data-lazy-img') || '';
          if (imgUrl && !imgUrl.startsWith('http')) imgUrl = 'https:' + imgUrl;
        }

        // Product URL
        var productUrl = pid ? 'https://item.jd.com/' + pid + '.html' : '';
        if (!productUrl) {
          var productLink = card.querySelector('a[href*="item.jd.com"]');
          if (productLink) {
            productUrl = productLink.href;
            if (productUrl && !productUrl.startsWith('http')) productUrl = 'https:' + productUrl;
          }
        }

        products.push({
          title: title,
          price: price,
          isJDSelfOperated: isSelf,
          reviewCount: reviewCount,
          goodRate: goodRate,
          shopName: shopName,
          imageUrl: imgUrl,
          url: productUrl
        });
      } catch(e) {
        // Skip cards that fail to parse
      }
    });

    return { products: products, totalResults: totalResults };
  }

  // ───────────────────────────
  // STRATEGY 1: Try fetch first
  // ───────────────────────────
  var html = null;
  var fetchFailed = false;

  try {
    var resp = await fetch(url, {
      credentials: 'include',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
      }
    });

    if (resp.ok) {
      html = await resp.text();
    } else if (resp.status === 302 || resp.status === 403) {
      return {
        error: 'HTTP ' + resp.status + ': 请求被京东拦截',
        hint: '京东检测到异常访问，已将请求重定向或拒绝。需要中国大陆IP且已登录。',
        action: '1. 配置中国代理\n2. 在浏览器中打开 https://search.jd.com 登录京东\n3. 保持登录状态重新运行搜索\n4. 如仍失败，请先在浏览器中手动搜索 "' + keyword + '"，然后在搜索结果页运行此适配器'
      };
    }
  } catch(e) {
    fetchFailed = true;
    // fetch blocked by JD risk handler → fall through to Strategy 2
  }

  // ───────────────────────────────────────────────
  // STRATEGY 2: Parse current DOM if fetch returned nothing
  // ───────────────────────────────────────────────
  // JD blocks fetch/XHR via cfe.m.jd.com risk handler. When fetch fails or
  // returns a page with no products, try parsing the current browser DOM.
  // This works when the user has already navigated to the search page.
  var currentUrl = window.location.href;
  var isOnSearch = currentUrl.indexOf('search.jd.com/Search') !== -1 && currentUrl.indexOf('keyword=') !== -1;

  if (isOnSearch) {
    var domParsed = parseSearchResults(document, currentUrl);

    if (domParsed.products.length > 0) {
      // Apply price filters client-side
      if (priceMin !== null) {
        domParsed.products = domParsed.products.filter(function(p) { return p.price >= priceMin; });
      }
      if (priceMax !== null) {
        domParsed.products = domParsed.products.filter(function(p) { return p.price <= priceMax; });
      }

      var currentKeyword = '';
      try { currentKeyword = new URL(currentUrl).searchParams.get('keyword') || ''; } catch(_) {}

      return {
        keyword: currentKeyword || keyword,
        totalResults: domParsed.products.length,
        products: domParsed.products,
        _note: fetchFailed ? 'fetch被风控拦截，使用当前页面DOM解析' : 'fetch返回空页，使用当前页面DOM解析'
      };
    }
  }

  // If fetch failed and no DOM fallback available
  if (fetchFailed || !html) {
    if (!isOnSearch) {
      return {
        error: '网络请求被京东风控拦截',
        hint: '京东的 fetch/XHR 请求被 cfe.m.jd.com 风控系统拦截。需要手动导航到搜索页面后再运行适配器。',
        action: '1. 在浏览器中打开: ' + url + '\n2. 确保登录京东且搜索结果正常加载\n3. 在搜索结果页重新运行此适配器',
        searchUrl: url
      };
    }
    return {
      error: '当前页面未解析到商品数据',
      hint: '请确认浏览器已显示京东搜索结果（非登录页），然后重试。',
      keyword: keyword,
      products: []
    };
  }

  // ─────────────────────────────
  // STRATEGY 3: Parse fetched HTML
  // ─────────────────────────────
  var parser = new DOMParser();
  var doc = parser.parseFromString(html, 'text/html');

  // Check if redirected to login
  if (html.indexOf('登录') !== -1 && (html.indexOf('passport') !== -1 || html.indexOf('login.aspx') !== -1)) {
    return {
      error: '被重定向到京东登录页面',
      hint: '当前IP不在中国大陆，京东要求登录。需要中国大陆IP代理且已登录。',
      action: '1. 配置中国代理\n2. 在浏览器中打开 https://search.jd.com 确认可正常搜索\n3. 登录后重新运行'
    };
  }

  // Check for captcha
  if (html.indexOf('验证') !== -1 && (html.indexOf('captcha') !== -1 || html.indexOf('滑块') !== -1)) {
    return {
      error: '需要完成验证码验证',
      hint: '京东触发了验证码。需要在中国网络环境下通过浏览器完成验证后重试。',
      action: '在浏览器中打开 ' + url + ' 完成验证后再试'
    };
  }

  var parsed = parseSearchResults(doc, url);

  if (parsed.products.length === 0) {
    return {
      keyword: keyword,
      totalResults: 0,
      products: [],
      hint: '未找到商品，可能原因：\n1. 搜索关键词过于生僻\n2. 需要在中国大陆网络环境下运行\n3. 京东页面结构已更新，需要更新解析逻辑'
    };
  }

  // Apply price filters
  if (priceMin !== null) {
    parsed.products = parsed.products.filter(function(p) { return p.price >= priceMin; });
  }
  if (priceMax !== null) {
    parsed.products = parsed.products.filter(function(p) { return p.price <= priceMax; });
  }

  return {
    keyword: keyword,
    totalResults: parsed.products.length,
    products: parsed.products
  };
}
