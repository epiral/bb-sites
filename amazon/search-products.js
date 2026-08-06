/* @meta
{
  "name": "amazon/search-products",
  "description": "Amazon商品搜索 - 按关键词搜索Amazon商品 (product search: title, ASIN, price, rating, prime, url)",
  "domain": "amazon.com",
  "args": {
    "keyword": {"required": true, "description": "搜索关键词，如 'laptop'、'headphones'、'kindle'"},
    "department": {"required": false, "description": "商品分类搜索别名，如 electronics（电子产品）、books（图书）、appliances（家电）、tools（工具）、sports（运动）、clothing（服装）"}
  },
  "tags": ["shopping", "ecommerce", "amazon", "akamai", "read-only"],
  "readOnly": true,
  "example": "bb-browser site amazon/search-products --keyword \"laptop\" --department electronics"
}
*/

async function(args) {
  const keyword = (args.keyword || '').trim();
  if (!keyword) {
    return {
      error: '缺少必填参数: keyword（搜索关键词）',
      hint: '请输入要搜索的Amazon商品关键词，例如：laptop、headphones、kindle、iPhone',
      action: 'bb-browser site amazon/search-products --keyword "<搜索词>"'
    };
  }

  const department = (args.department || '').trim();

  // Helper: normalize URL
  const normUrl = (url) => {
    if (!url) return '';
    if (url.startsWith('//')) return 'https:' + url;
    if (url.startsWith('/')) return 'https://www.amazon.com' + url;
    if (url.startsWith('http')) return url;
    return 'https://www.amazon.com/' + url;
  };

  // Helper: parse price string (e.g. "1,566.00" -> 1566)
  const parsePrice = (whole, fraction) => {
    const w = (whole || '').replace(/,/g, '').replace(/[^0-9]/g, '');
    const f = (fraction || '').replace(/[^0-9]/g, '');
    if (!w) return null;
    const val = parseFloat(w + '.' + (f || '00'));
    return isNaN(val) ? null : val;
  };

  // Helper: parse rating stars (e.g. "4.5 out of 5 stars" -> 4.5)
  const parseRating = (str) => {
    if (!str) return null;
    const m = str.match(/([\d.]+)/);
    return m ? parseFloat(m[1]) : null;
  };

  // Helper: parse review count (e.g. "12,345" -> 12345)
  const parseReviewCount = (str) => {
    if (!str) return 0;
    const m = str.replace(/,/g, '').match(/(\d+)/);
    return m ? parseInt(m[1], 10) : 0;
  };

  // Helper: extract total results from heading text
  // Format: "1-16 of over 100,000 results for \"laptop\""
  // Format: "1-16 of 500 results for \"laptop\""
  const parseTotalResults = (text) => {
    if (!text) return 0;
    // Try "of over X results" first
    let m = text.match(/of\s+over\s+([\d,]+)\s+results/i);
    if (m) return parseInt(m[1].replace(/,/g, ''), 10);
    // Try "of X results" 
    m = text.match(/of\s+([\d,]+)\s+results/i);
    if (m) return parseInt(m[1].replace(/,/g, ''), 10);
    // Try "X results"
    m = text.match(/([\d,]+)\s+results/i);
    if (m) return parseInt(m[1].replace(/,/g, ''), 10);
    return 0;
  };

  // Build search URL
  let searchUrl = 'https://www.amazon.com/s?k=' + encodeURIComponent(keyword);
  if (department) {
    searchUrl += '&i=' + encodeURIComponent(department);
  }

  // =====================================================
  // Strategy 1: Fetch search HTML and parse with DOMParser
  // =====================================================
  try {
    const resp = await fetch(searchUrl, {
      credentials: 'include',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7'
      }
    });

    if (resp.ok) {
      const html = await resp.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      // Check for captcha / bot detection
      if (html.includes('captcha') || html.includes('validate') || html.includes('verify') || html.includes('sorry')) {
        return {
          error: 'Amazon触发了反爬虫验证（Captcha / 机器人检测）',
          hint: 'Amazon使用Akamai和内部反爬系统，检测到非浏览器访问时要求验证。\n\n' +
                '解决方法：\n' +
                '1. 在浏览器中手动打开 Amazon.com 搜索页面完成一次搜索\n' +
                '2. 确保浏览器Cookie有效（已登录Amazon账号更佳）\n' +
                '3. 使用代理IP（建议使用美国IP）',
          action: 'bb-browser open "https://www.amazon.com/s?k=' + encodeURIComponent(keyword) + '"',
          debug: { keyword, department, url: searchUrl }
        };
      }

      // Check if we got redirected to homepage or sign-in
      if (html.includes('sign-in') || html.includes('signin') || html.includes('ap_signin')) {
        return {
          error: '被重定向到Amazon登录页面',
          hint: 'Amazon检测到非浏览器访问，需要登录后才能搜索。\n\n' +
                '解决方法：\n' +
                '1. 在浏览器中打开 amazon.com 并登录Amazon账号\n' +
                '2. 登录后再运行搜索命令',
          action: 'bb-browser open https://www.amazon.com  # 登录后重试'
        };
      }

      // Extract total results from heading
      const headingEl = doc.querySelector('span.rush-component, h1 span.a-color-state, [data-component-type="s-result-info-bar"] span, .a-section.a-spacing-small span');
      let totalResults = 0;
      if (headingEl) {
        totalResults = parseTotalResults(headingEl.textContent);
      }
      // If not found, try broader search
      if (!totalResults) {
        const allSpans = doc.querySelectorAll('span, div');
        for (const el of allSpans) {
          const t = el.textContent.trim();
          if (t.match(/\d[\d,]*\s*-\s*\d[\d,]*\s*(of|results)/i)) {
            totalResults = parseTotalResults(t);
            if (totalResults) break;
          }
        }
      }

      // Parse product cards
      const cardSelector = '[data-component-type="s-search-result"]';
      const productCards = doc.querySelectorAll(cardSelector);
      const products = [];

      if (productCards.length > 0) {
        productCards.forEach(card => {
          try {
            const asin = card.getAttribute('data-asin') || '';

            // Title: try multiple selectors for robustness
            let title = '';
            // First try the link with clamp classes (both sponsored and organic)
            const clampLink = card.querySelector('a.s-line-clamp-2, a[class*="clamp-2"], a[class*="clamp-3"], a[class*="s-link-style"]');
            if (clampLink) {
              title = clampLink.textContent.trim();
            }
            // Fallback: try h2 > a > span
            if (!title) {
              const titleEl = card.querySelector('h2 a span, h2 a');
              if (titleEl) {
                title = (titleEl.textContent || titleEl.getAttribute('aria-label') || '').trim();
              }
            }
            // Fallback: try h2 text
            if (!title) {
              const h2 = card.querySelector('h2');
              if (h2) title = h2.textContent.trim();
            }
            // Fallback: try any link with long text content
            if (!title) {
              const links = card.querySelectorAll('a');
              for (const link of links) {
                const t = (link.textContent || '').trim();
                if (t.length > 20) {
                  title = t;
                  break;
                }
              }
            }
            if (!title && asin) return; // No title, skip

            // Price
            const wholeEl = card.querySelector('.a-price .a-price-whole');
            const fractionEl = card.querySelector('.a-price .a-price-fraction');
            const price = parsePrice(
              wholeEl ? wholeEl.textContent : null,
              fractionEl ? fractionEl.textContent : null
            );

            // Price display string
            const priceStr = card.querySelector('.a-price');
            const priceDisplay = priceStr ? priceStr.textContent.trim().replace(/\s+/g, ' ') : '';

            // Rating stars
            const ratingEl = card.querySelector('i.a-icon-star, i.a-icon-star-small');
            const rating = ratingEl ? parseRating(ratingEl.textContent) : null;

            // Review count
            const reviewEl = card.querySelector('span.a-size-base.s-underline-text, a[href*="#customerReviews"]');
            const reviewCount = reviewEl ? parseReviewCount(reviewEl.textContent) : 0;

            // Prime indicator
            const primeEl = card.querySelector('i.a-icon-prime');
            const hasPrime = !!primeEl;

            // Image URL
            const imgEl = card.querySelector('img.s-image');
            let image = '';
            if (imgEl) {
              image = imgEl.getAttribute('src') || imgEl.getAttribute('data-src') || '';
            }

            // Product URL
            let url = '';
            const linkEl = card.querySelector('a[href*="/dp/"]');
            if (linkEl) {
              url = normUrl(linkEl.getAttribute('href') || '');
            }
            if (!url && asin) {
              url = 'https://www.amazon.com/dp/' + asin;
            }

            products.push({
              title: title.replace(/<[^>]*>/g, '').substring(0, 500),
              asin,
              price,
              priceDisplay: priceDisplay || undefined,
              rating,
              reviewCount,
              prime: hasPrime,
              image,
              url
            });
          } catch (e) {
            // Skip items that fail to parse
          }
        });
      }

      if (products.length > 0) {
        return {
          keyword,
          department: department || undefined,
          totalResults: totalResults || products.length,
          products,
          source: 'html'
        };
      }

      // If no products found with primary selectors, try fallback selectors
      const fallbackCards = doc.querySelectorAll(
        '.s-result-item[data-asin], ' +
        '.sg-col-4-of-24[data-asin], ' +
        '.a-spacing-base[data-asin], ' +
        'div[data-asin]:not([data-asin=""])'
      );

      if (fallbackCards.length > 0) {
        fallbackCards.forEach(card => {
          try {
            const asin = card.getAttribute('data-asin') || '';
            if (!asin) return;

            // Try to find title in various places
            const titleLinks = card.querySelectorAll('a[href*="/dp/"]');
            let title = '';
            let url = '';
            for (const link of titleLinks) {
              const href = link.getAttribute('href') || '';
              if (href.includes('/dp/' + asin) || href.includes('/dp/')) {
                const spans = link.querySelectorAll('span');
                for (const sp of spans) {
                  if (sp.textContent.trim().length > 10) {
                    title = sp.textContent.trim();
                    break;
                  }
                }
                if (!title) title = link.textContent.trim();
                url = normUrl(href);
                break;
              }
            }

            if (!title) return;

            // Price
            let price = null;
            const pEls = card.querySelectorAll('.a-price .a-price-whole, .a-offscreen');
            for (const pEl of pEls) {
              const pText = pEl.textContent.trim().replace(/[^0-9.]/g, '');
              if (pText) {
                price = parseFloat(pText);
                if (!isNaN(price) && price > 0) break;
              }
            }

            // Image
            const imgEl = card.querySelector('img');
            let image = '';
            if (imgEl) {
              image = imgEl.getAttribute('src') || imgEl.getAttribute('data-src') || '';
            }

            // Check for prime
            const prime = !!card.querySelector('.a-icon-prime');

            // Rating
            const ratingEl = card.querySelector('.a-icon-star');
            const rating = ratingEl ? parseRating(ratingEl.textContent) : null;

            // Review count
            const reviewEl = card.querySelector('.a-size-base.s-underline-text, a[href*="#customerReviews"]');
            const reviewCount = reviewEl ? parseReviewCount(reviewEl.textContent) : 0;

            products.push({
              title: title.substring(0, 500),
              asin,
              price,
              rating,
              reviewCount,
              prime,
              image,
              url: url || 'https://www.amazon.com/dp/' + asin
            });
          } catch (e) {
            // Skip
          }
        });
      }

      if (products.length > 0) {
        return {
          keyword,
          department: department || undefined,
          totalResults: totalResults || products.length,
          products,
          source: 'html_fallback'
        };
      }
    }
  } catch (e) {
    // Fall through to next strategy
  }

  // =====================================================
  // Strategy 2: Browser-based extraction (when document is available)
  // =====================================================
  try {
    if (typeof document !== 'undefined') {
      const cards = document.querySelectorAll('[data-component-type="s-search-result"]');
      const products = [];
      let totalResults = 0;

      // Try to get total results from page
      const allEls = document.querySelectorAll('span, div, h1');
      for (const el of allEls) {
        const t = el.textContent.trim();
        if (t.match(/\d[\d,]*\s*-\s*\d[\d,]*\s*(of|results)/i)) {
          totalResults = parseTotalResults(t);
          if (totalResults) break;
        }
      }

      for (const card of cards) {
        try {
          const asin = card.getAttribute('data-asin') || '';

          // Title: try multiple selectors for robustness
          let title = '';
          const clampLink = card.querySelector('a.s-line-clamp-2, a[class*="clamp-2"], a[class*="clamp-3"], a[class*="s-link-style"]');
          if (clampLink) {
            title = clampLink.textContent.trim();
          }
          if (!title) {
            const sp = card.querySelector('h2 a span, h2 a');
            title = sp ? (sp.textContent || sp.getAttribute('aria-label') || '').trim() : '';
          }
          if (!title) {
            const h2 = card.querySelector('h2');
            title = h2 ? h2.textContent.trim() : '';
          }
          if (!title) {
            const links = card.querySelectorAll('a');
            for (const link of links) {
              const t = (link.textContent || '').trim();
              if (t.length > 20) { title = t; break; }
            }
          }
          if (!title) continue;

          // Price
          const wp = card.querySelector('.a-price .a-price-whole');
          const fp = card.querySelector('.a-price .a-price-fraction');
          const price = parsePrice(
            wp ? wp.textContent : null,
            fp ? fp.textContent : null
          );

          // Rating
          const re = card.querySelector('i.a-icon-star, i.a-icon-star-small');
          const rating = re ? parseRating(re.textContent) : null;

          // Reviews
          const rc = card.querySelector('span.a-size-base.s-underline-text');
          const reviewCount = rc ? parseReviewCount(rc.textContent) : 0;

          // Prime
          const prime = !!card.querySelector('i.a-icon-prime');

          // Image
          const img = card.querySelector('img.s-image');
          const image = img ? (img.getAttribute('src') || img.getAttribute('data-src') || '') : '';

          // URL
          let url = '';
          const linkEl = card.querySelector('a[href*="/dp/"]');
          if (linkEl) {
            url = normUrl(linkEl.getAttribute('href') || '');
          }
          if (!url && asin) {
            url = 'https://www.amazon.com/dp/' + asin;
          }

          products.push({
            title: title.substring(0, 500),
            asin,
            price,
            rating,
            reviewCount,
            prime,
            image,
            url
          });
        } catch (e) {
          // Skip
        }
      }

      if (products.length > 0) {
        return {
          keyword,
          department: department || undefined,
          totalResults: totalResults || products.length,
          products,
          source: 'browser'
        };
      }
    }
  } catch (e) {
    // Fall through
  }

  // =====================================================
  // All strategies failed
  // =====================================================
  return {
    error: '无法获取Amazon搜索结果',
    hint: 'Amazon使用Akamai CDN和强大的反爬虫保护，可能原因：\n\n' +
          '1. 🛡️ 反爬虫拦截：Amazon检测到自动化访问，触发了验证码或封禁\n' +
          '2. 🌐 网络限制：当前IP可能被Amazon限制（建议使用美国IP代理）\n' +
          '3. 🔑 需要登录：某些搜索需要Amazon账号登录\n\n' +
          '解决方法：\n' +
          '1. 在浏览器中打开 amazon.com 并登录Amazon账号\n' +
          '2. 在浏览器中打开搜索页面确认可以正常查看结果\n' +
          '3. 使用美国代理后重试',
    action: 'bb-browser open "https://www.amazon.com/s?k=' + encodeURIComponent(keyword) + '"',
    debug: { keyword, department, url: searchUrl }
  };
}
