/* @meta
{
  "name": "ebay/find-a-product",
  "description": "eBay商品搜索 - 按关键词搜索eBay商品 (product search: title, price, condition, shipping, seller, url)",
  "domain": "www.ebay.com",
  "args": {
    "keyword": {"required": true, "description": "搜索关键词，如 laptop, iPhone 15"}
  },
  "tags": ["ebay", "marketplace", "shopping", "search", "akamai", "read-only"],
  "readOnly": true,
  "example": "bb-browser site ebay/find-a-product laptop"
}
*/

async function(args) {
  // 参数校验
  if (!args.keyword || !args.keyword.trim()) {
    return {
      error: '缺少搜索关键词 keyword',
      hint: '请提供要搜索的商品关键词',
      action: '例如: bb-browser site ebay/find-a-product "laptop"'
    };
  }

  const keyword = args.keyword.trim();

  // 构建搜索 URL — Buy It Now 排序，排除拍卖
  const searchPath = '/sch/i.html?_nkw=' + encodeURIComponent(keyword) + '&_sop=12&LH_BIN=1';

  // Step 1: 用 fetch 获取搜索页 HTML（利用浏览器已有的 eBay Cookie/Session）
  let resp;
  try {
    resp = await fetch(searchPath, {credentials: 'include'});
  } catch (e) {
    return {
      error: '网络请求失败: ' + e.message,
      hint: '请确保已在浏览器中打开 www.ebay.com',
      action: '请先打开 https://www.ebay.com 再运行此命令'
    };
  }

  if (!resp.ok) {
    // Akamai 拦截或需要登录
    if (resp.status === 403 || resp.status === 401) {
      return {
        error: 'eBay 访问被拦截 (HTTP ' + resp.status + ')',
        hint: 'Akamai 防爬虫拦截，请确认已在浏览器中登录 eBay 并完成人机验证',
        action: '在浏览器中打开 https://www.ebay.com，确保登录后刷新再试'
      };
    }
    return {
      error: '搜索页面请求失败 (HTTP ' + resp.status + ')',
      hint: 'eBay 搜索服务暂时不可用',
      action: '请稍后重试'
    };
  }

  // Step 2: 解析 HTML
  let html;
  try {
    html = await resp.text();
  } catch (e) {
    return {
      error: '解析响应内容失败: ' + e.message,
      hint: '网络异常或响应数据损坏',
      action: '请重试'
    };
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // Step 3: 提取总结果数
  let totalResults = 0;
  const totalEl = doc.querySelector('.srp-controls__count-heading');
  if (totalEl) {
    const totalText = totalEl.textContent.trim();
    const match = totalText.match(/[\d,]+/);
    if (match) {
      totalResults = parseInt(match[0].replace(/,/g, '')) || 0;
    }
  }

  // Step 4: 提取商品列表
  const items = doc.querySelectorAll('[data-viewport]');
  const products = [];

  items.forEach(item => {
    const listingId = item.getAttribute('data-listingid');

    // 跳过 eBay 内部占位/赞助卡片
    if (!listingId || listingId === '2500219655424533') return;

    // --- 标题 ---
    const titleEl = item.querySelector('.s-card__title');
    if (!titleEl) return;
    let title = titleEl.textContent.trim();
    if (!title) return;
    // 去掉末尾的 "Opens in a new window or tab"
    title = title.replace(/Opens in a new window or tab\s*$/, '').trim();

    // --- 商品链接 ---
    const link = item.querySelector('a.s-card__link');
    let rawUrl = '';
    if (link) {
      rawUrl = link.getAttribute('href') || '';
    }
    // 清理 URL — 去掉 tracking 参数
    const cleanUrl = rawUrl.split('?')[0];
    const url = cleanUrl.startsWith('http') ? cleanUrl : 'https://www.ebay.com' + cleanUrl;

    // --- 价格 ---
    const priceEl = item.querySelector('.s-card__price');
    const price = priceEl ? priceEl.textContent.trim() : '';

    // --- 成色/状态 (New, Used, Parts Only 等) ---
    const condEl = item.querySelector('.s-card__subtitle');
    let condition = condEl ? condEl.textContent.trim() : '';
    condition = condition.split('·')[0].trim();

    // --- 运费 ---
    let shipping = '';
    const attrRows = item.querySelectorAll('.s-card__attribute-row');
    attrRows.forEach(row => {
      const text = row.textContent.trim();
      if (text.match(/delivery|shipping|free|邮费|运费/i)) {
        shipping = text;
      }
    });

    // --- 卖家 ---
    // 卖家信息在 secondary 区域，格式如 "sellerName  99.8% positive (12.6K)" 或 "sellerName (8,308) 99.5%"
    let seller = '';
    const secondaryEl = item.querySelector('.su-card-container__attributes__secondary');
    if (secondaryEl) {
      const secondaryText = secondaryEl.textContent.trim();
      // 先尝试用双空格分割（最新版eBay UI）
      let parts = secondaryText.split(/\s{2,}/);
      if (parts.length >= 2) {
        seller = parts[0].trim();
      } else {
        // 单空格格式，取 "positive" 前的部分或第一段
        const posIdx = secondaryText.indexOf('positive');
        if (posIdx > 0) {
          // 取 "positive" 前面的内容，再取最后一个单词之前的作为seller
          const beforePositive = secondaryText.substring(0, posIdx).trim();
          const words = beforePositive.split(/\s+/);
          seller = words[0];
        } else {
          // 其他格式，取第一个非数字词
          const words = secondaryText.split(/\s+/);
          if (words.length > 0 && !words[0].match(/^[\d$]/)) {
            seller = words[0];
          }
        }
      }
      // 清理 seller 中的干扰后缀
      if (seller.match(/^(Almost|Last|eBay|New)/i)) seller = '';
    }
    // 兜底：某些卡片没有 secondary 区域，卖家信息在 .su-styled-text.secondary.large 中
    // 格式如 "jre3533 (8,308) 99.5%" 或 "hawk_line (48,015) 98.3%"
    if (!seller) {
      const feedbackSpan = item.querySelector('.su-styled-text.secondary.large');
      if (feedbackSpan) {
        const txt = feedbackSpan.textContent.trim();
        // 卖家名后跟 "(" 括号+数字 或 数字+%
        const sellerMatch = txt.match(/^([a-zA-Z][a-zA-Z0-9_-]+)\s*(\([\d,]+\)\s*[\d.]+%|[\d.]+%)/);
        if (sellerMatch) {
          seller = sellerMatch[1];
        } else {
          // 更宽松的匹配：包含数字+百分比的文本
          const looseMatch = txt.match(/^([a-zA-Z][a-zA-Z0-9_-]+)/);
          if (looseMatch && txt.match(/[\d]+%|\(\d+/)) {
            seller = looseMatch[1];
          }
        }
      }
    }

    // --- 图片 ---
    const img = item.querySelector('img');
    let image = '';
    if (img) {
      image = img.getAttribute('src') || img.getAttribute('data-src') || '';
    }

    products.push({
      title: title,
      price: price,
      condition: condition,
      shipping: shipping,
      seller: seller,
      url: url,
      image: image
    });
  });

  // Step 5: 返回结构化结果
  return {
    keyword: keyword,
    totalResults: totalResults || products.length,
    products: products
  };
}
