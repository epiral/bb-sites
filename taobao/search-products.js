/* @meta
{
  "name": "taobao/search-products",
  "description": "淘宝商品搜索 - 按关键词搜索淘宝商品 (product search: title, price, soldCount, shopName, tmallFlag, url)",
  "domain": "taobao.com",
  "args": {
    "keyword": {"required": true, "description": "搜索关键词，如'手机'、'连衣裙'"},
    "priceMin": {"required": false, "description": "最低价格（元）"},
    "priceMax": {"required": false, "description": "最高价格（元）"},
    "sort": {"required": false, "description": "排序方式：sales（销量）、price（价格从低到高）、rating（信用）"}
  },
  "tags": ["anti-bot"],
  "readOnly": true,
  "example": "bb-browser site taobao/search-products --keyword \"手机\" --sort sales"
}
*/

async function(args) {
  const keyword = (args.keyword || '').trim();
  if (!keyword) return {error: '缺少必填参数: keyword（搜索关键词）', hint: '请输入要搜索的商品关键词，如：手机、连衣裙、笔记本电脑'};

  const priceMin = args.priceMin ? parseFloat(args.priceMin) : null;
  const priceMax = args.priceMax ? parseFloat(args.priceMax) : null;

  // Sort param mapping
  const sortMap = {
    'sales': '_sale',
    'price': '_price',
    'rating': '_credit',
    '_sale': '_sale',
    '_price': '_price',
    '_credit': '_credit'
  };
  const sort = sortMap[args.sort] || '';

  // Helper: normalize URL
  const normUrl = (url) => {
    if (!url) return '';
    if (url.startsWith('//')) return 'https:' + url;
    if (url.startsWith('/')) return 'https:' + url;
    return url;
  };

  // Helper: extract price number
  const parsePrice = (str) => {
    if (!str) return null;
    const m = str.replace(/,/g, '').match(/[\d.]+/);
    return m ? parseFloat(m[0]) : null;
  };

  // Helper: extract sold count
  const parseSold = (str) => {
    if (!str) return 0;
    const m = str.replace(/,/g, '').match(/([\d.]+)(万|w)?/i);
    if (!m) return 0;
    const num = parseFloat(m[1]);
    if (m[2] && (m[2] === '万' || m[2] === 'w' || m[2] === 'W')) return Math.round(num * 10000);
    return num;
  };

  // =====================================================
  // Strategy 1: Fetch search page HTML and parse via DOM
  // =====================================================
  let searchUrl = 'https://s.taobao.com/search?q=' + encodeURIComponent(keyword) + '&search_type=item&sourceId=tb.index';
  if (sort) searchUrl += '&sort=' + sort;
  if (priceMin !== null) searchUrl += '&min_price=' + priceMin;
  if (priceMax !== null) searchUrl += '&max_price=' + priceMax;

  try {
    const resp = await fetch(searchUrl, {credentials: 'include', headers: {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'}});

    if (resp.ok) {
      const html = await resp.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      // Try to extract embedded JSON data from script tags
      let jsonData = null;
      const scripts = doc.querySelectorAll('script');
      for (const s of scripts) {
        const text = s.textContent || '';
        // Look for window.__INITIAL_STATE__ or g_page_config or similar
        for (const pat of [
          /window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\});/,
          /g_page_config\s*=\s*(\{[\s\S]*?\});/,
          /"itemList"\s*:\s*(\[[\s\S]*?\])\s*[,}]/,
          /"list"\s*:\s*(\[[\s\S]*?\])\s*[,}]/
        ]) {
          const m = text.match(pat);
          if (m) {
            try {
              const parsed = JSON.parse(m[1]);
              jsonData = parsed;
              break;
            } catch(e) {}
          }
        }
        if (jsonData) break;
      }

      if (jsonData) {
        // Try different paths to find product list
        const itemList = jsonData.itemList || jsonData.list || jsonData.data?.itemList || jsonData.data?.list || jsonData.items || [];
        if (Array.isArray(itemList) && itemList.length > 0) {
          const products = itemList.map((item, i) => {
            const itemId = item.itemId || item.nid || item.id || item.iid || '';
            const title = (item.title || item.name || item.rawTitle || '').replace(/<[^>]*>/g, '').trim();
            const price = parsePrice(item.price || item.reservePrice || item.viewPrice || item.view_fee || '');
            const sold = item.soldCount || item.sold || item.saleCount || item.biz30day || 0;
            const shopName = item.shopName || item.shop_name || item.nick || item.userId || '';
            const tmallFlag = item.tmallFlag || item.tmall || item.isTmall || (item.shopIcon || '').includes('tmall') ? true : false;
            const image = normUrl(item.image || item.picUrl || item.pic || item.img || item.pictUrl || '');
            const url = itemId ? 'https://item.taobao.com/item.htm?id=' + itemId : '';

            if (!title && !itemId) return null;
            return {title: title || '', price, soldCount: typeof sold === 'number' ? sold : parseSold(sold), shopName, isTmall: !!tmallFlag, url, image};
          }).filter(Boolean);

          if (products.length > 0) {
            return {keyword, totalResults: jsonData.totalCount || jsonData.total || jsonData.totalResults || products.length, products, source: 'api_json'};
          }
        }
      }

      // Try DOM parsing: look for product items in the rendered HTML
      // The new SPA page uses class names like "cardItem--xxx" or "item--xxx"
      // Also try the older page structure
      let productEls = doc.querySelectorAll('[class*="cardItem"], [class*="CardItem"], [class*="item-card"], [class*="card-item"], [class*="CardWrapper"], [class*="productCard"]');

      // If nothing found with CSS modules, try generic selectors
      if (productEls.length === 0) {
        productEls = doc.querySelectorAll(
          'div[data-id], div[data-nid], ' +
          'li[data-id], li[data-nid], ' +
          '.J_MouserOnverReq, .item, .grid-item, ' +
          'div[class*="Item"]'
        );
      }

      if (productEls.length > 0) {
        const products = [];
        const seenIds = new Set();

        productEls.forEach(el => {
          // Get item ID
          const itemId = el.getAttribute('data-id') || el.getAttribute('data-nid') || '';

          // Title
          const titleEl = el.querySelector('[class*="title"], [class*="Title"], a[href*="item.htm"], h3, [class*="name"]');
          let title = '';
          if (titleEl) {
            title = (titleEl.textContent || titleEl.getAttribute('title') || '').replace(/\s+/g, ' ').trim();
          }
          if (!title) {
            // Try getting from the element's text
            const allText = (el.textContent || '').replace(/\s+/g, ' ').trim();
            if (allText.length > 3 && allText.length < 100) title = allText;
          }
          if (!title) return;

          // Price
          const priceEl = el.querySelector('[class*="price"], [class*="Price"], [class*="money"]');
          let price = null;
          if (priceEl) {
            price = parsePrice(priceEl.textContent);
          }

          // Sold count
          const dealEl = el.querySelector('[class*="deal-cnt"], [class*="sold"], [class*="sale"], [class*="pay"]');
          let sold = 0;
          if (dealEl) {
            sold = parseSold(dealEl.textContent);
          }

          // Shop name
          const shopEl = el.querySelector('[class*="shop"]');
          let shopName = shopEl ? (shopEl.textContent || shopEl.getAttribute('title') || '').trim() : '';

          // Tmall flag
          let isTmall = false;
          const tmallEl = el.querySelector('[class*="tmall"], [class*="Tmall"], img[src*="tmall"]');
          if (tmallEl) isTmall = true;
          if (shopName.includes('天猫') || shopName.includes('Tmall')) isTmall = true;

          // Image
          const imgEl = el.querySelector('img');
          let image = '';
          if (imgEl) {
            image = normUrl(imgEl.getAttribute('src') || imgEl.getAttribute('data-src') || '');
          }

          // URL
          const linkEl = el.querySelector('a[href*="item.htm"], a[href*="item.taobao.com"], a[href*="detail.tmall.com"]');
          let url = '';
          if (linkEl) {
            url = normUrl(linkEl.getAttribute('href') || '');
          } else if (itemId) {
            url = 'https://item.taobao.com/item.htm?id=' + itemId;
          }

          const dedupKey = itemId || title;
          if (seenIds.has(dedupKey)) return;
          seenIds.add(dedupKey);

          products.push({title, price, soldCount: sold, shopName, isTmall, url, image});
        });

        if (products.length > 0) {
          return {keyword, totalResults: products.length, products, source: 'dom_html'};
        }
      }

      // Try the old-style search result structure
      const oldItems = doc.querySelectorAll('.item-box, .result-grid, .item-card, .J_ItemBox');
      if (oldItems.length > 0) {
        const products = [];
        oldItems.forEach(el => {
          const titleEl = el.querySelector('.title, [class*="Title"], a[href*="item.htm"]');
          if (!titleEl) return;
          const title = (titleEl.textContent || titleEl.getAttribute('title') || '').replace(/\s+/g, ' ').trim();
          if (!title) return;

          const priceEl = el.querySelector('.price, [class*="Price"]');
          const price = priceEl ? parsePrice(priceEl.textContent) : null;

          const dealEl = el.querySelector('.deal-cnt, [class*="deal"]');
          const sold = dealEl ? parseSold(dealEl.textContent) : 0;

          const shopEl = el.querySelector('.shop, [class*="Shop"], [class*="shop"]');
          const shopName = shopEl ? (shopEl.textContent || '').trim() : '';

          const linkEl = titleEl.closest('a') || titleEl;
          const url = normUrl(linkEl.getAttribute('href') || '');

          products.push({title, price, soldCount: sold, shopName, isTmall: false, url, image: ''});
        });
        if (products.length > 0) {
          return {keyword, totalResults: products.length, products, source: 'dom_old'};
        }
      }
    }
  } catch(e) {
    // Fall through to next strategy
  }

  // =====================================================
  // Strategy 2: Suggest API (limited - only suggestions)
  // =====================================================
  try {
    const suggestResp = await fetch('https://suggest.taobao.com/sug?q=' + encodeURIComponent(keyword) + '&code=utf-8', {credentials: 'include'});
    if (suggestResp.ok) {
      const suggestData = await suggestResp.json();
      if (suggestData?.result && Array.isArray(suggestData.result) && suggestData.result.length > 0) {
        const suggestions = suggestData.result.map(r => ({keyword: r[0], count: r[1]}));
        // Return suggestions as hints even though we don't have full product data
        return {
          error: '未获取到商品详情，仅获取到搜索建议',
          hint: '淘宝搜索页面为SPA动态加载，需要在浏览器中打开淘宝搜索页面并登录后使用。建议先在浏览器中打开 s.taobao.com 并登录。',
          action: 'bb-browser open https://s.taobao.com/search?q=' + encodeURIComponent(keyword),
          suggestions
        };
      }
    }
  } catch(e) {
    // Fall through
  }

  // =====================================================
  // Strategy 3: Try extracting from the currently rendered page
  // =====================================================
  try {
    // Try to get product data from the current page context
    // The SPA renders product cards as React components
    const productCards = document.querySelectorAll(
      'a[href*="item.taobao.com"], a[href*="detail.tmall.com"], a[href*="detail.taobao.com"]'
    );

    if (productCards.length > 0) {
      const products = [];
      const seen = new Set();
      productCards.forEach(el => {
        const href = el.getAttribute('href') || '';
        const url = normUrl(href);
        const title = (el.textContent || el.getAttribute('title') || '').replace(/\s+/g, ' ').trim();
        if (!title || seen.has(url)) return;
        seen.add(url);

        // Walk up to find the card container
        let card = el.closest('[class*="card"], [class*="Card"], [class*="item"], [class*="Item"]');
        if (!card) card = el.parentElement;

        let price = null;
        let sold = 0;
        let shopName = '';
        let isTmall = url.includes('tmall.com');

        if (card) {
          const priceEl = card.querySelector('[class*="price"], [class*="Price"]');
          if (priceEl) price = parsePrice(priceEl.textContent);

          const dealEl = card.querySelector('[class*="deal"], [class*="sold"], [class*="sale"]');
          if (dealEl) sold = parseSold(dealEl.textContent);

          const shopEl = card.querySelector('[class*="shop"], [class*="Shop"]');
          if (shopEl) shopName = (shopEl.textContent || '').trim();

          const tmallIcon = card.querySelector('[class*="tmall"], [class*="Tmall"]');
          if (tmallIcon) isTmall = true;
        }

        products.push({title, price, soldCount: sold, shopName, isTmall, url, image: ''});
      });

      if (products.length > 0) {
        return {keyword, totalResults: products.length, products, source: 'browser_dom'};
      }
    }

    // Also try to read from data attributes or React props
    const allDataItems = document.querySelectorAll('[data-spm*="item"], [data-spm*="Item"]');
    if (allDataItems.length > 0) {
      const products = [];
      allDataItems.forEach(el => {
        const title = el.getAttribute('title') || '';
        if (!title) return;
        const href = el.getAttribute('href') || '';
        products.push({
          title: title.trim(),
          price: null,
          soldCount: 0,
          shopName: '',
          isTmall: (href || '').includes('tmall.com'),
          url: normUrl(href),
          image: ''
        });
      });
      if (products.length > 0) {
        return {keyword, totalResults: products.length, products, source: 'browser_dom2'};
      }
    }
  } catch(e) {
    // Fall through
  }

  // =====================================================
  // All strategies failed
  // =====================================================
  return {
    error: '无法获取淘宝搜索结果',
    hint: '淘宝搜索页面是高度动态化的SPA应用，反爬机制较强。请先在浏览器中打开 s.taobao.com 并确保已登录，然后重试。\n\n' +
           '使用步骤：\n' +
           '1. bb-browser open https://www.taobao.com\n' +
           '2. 在打开的页面中登录淘宝账号\n' +
           '3. 重新运行此搜索命令',
    action: 'bb-browser open https://s.taobao.com/search?q=' + encodeURIComponent(keyword),
    debug: {keyword, sort, priceMin, priceMax}
  };
}
