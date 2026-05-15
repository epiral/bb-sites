/* @meta
{
  "name": "1688/search",
  "description": "Robust product search on 1688 utilizing active tab memory or DOM",
  "domain": "s.1688.com",
  "args": {
    "keyword": {"required": true, "description": "Search keyword"}
  },
  "capabilities": ["network", "browser"],
  "readOnly": true,
  "example": "bb-browser site 1688/search 键盘"
}
*/

async function(args) {
  if (!args.keyword) return { error: 'Missing argument: keyword' };

  let keyword = args.keyword;

  // 1. Handle potential already-encoded input or mangled strings (Encoding fix)
  if (keyword.includes('%')) {
    try { keyword = decodeURIComponent(keyword); } catch (e) { }
  }

  // Use a more robust check for non-ASCII characters and handle multiple encodings
  if (/[^\u0000-\u007F]/.test(keyword)) {
    try {
      const bytes = new Uint8Array([...keyword].map(c => c.charCodeAt(0) & 0xFF));
      
      const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
      try {
        utf8Decoder.decode(bytes);
      } catch (e) {
        const gbkDecoder = new TextDecoder('gbk');
        const decodedGBK = gbkDecoder.decode(bytes);
        if (!decodedGBK.includes('\uFFFD')) {
          keyword = decodedGBK;
        } else {
          const big5Decoder = new TextDecoder('big5');
          const decodedBig5 = big5Decoder.decode(bytes);
          if (!decodedBig5.includes('\uFFFD')) keyword = decodedBig5;
        }
      }
    } catch (e) { 
      console.warn('Encoding conversion failed:', e);
    }
  }

  // Helper: Extract items from 1688 initialization data
  const extractFromInitData = (data) => {
    const findOfferList = (obj) => {
      if (!obj) return null;
      if (Array.isArray(obj.offerList)) return obj.offerList;
      for (const key in obj) {
        if (typeof obj[key] === 'object') {
          const found = findOfferList(obj[key]);
          if (found) return found;
        }
      }
      return null;
    };
    const list = findOfferList(data) || [];
    return list.map(item => ({
      title: item.information?.subject || item.title || '',
      url: item.information?.detailUrl || item.detailUrl || '',
      imageUrl: item.image?.imgUrl || item.imgUrl || '',
      price: item.price?.priceInfo?.price || item.price || '',
      sales: item.saleQuantity || item.monthSoldInfo?.monthSold || item.tradeQuantity?.number || '',
      company: item.company?.name || item.shopInfo?.shopName || '',
      factoryAttributes: item.factoryInfo || item.company?.isFactory || false,
      deliveryPlace: item.location || item.company?.province || '',
      isBoutique: item.isBoutique || item.information?.isBoutique || false
    }));
  };

  // Helper: Detect Anti-Bot or Login Prompts
  const detectAntiBot = () => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return false;
    const loc = window.location.href;
    const title = document.title || '';
    if (loc.includes('login.1688.com') || title.includes('登录')) return 'login_required';
    if (document.querySelector('.nc-container, #nc_1_wrapper, #nocaptcha') || title.includes('验证') || document.body?.innerHTML?.includes('滑动验证')) {
      return 'captcha_detected';
    }
    return false;
  };

  // Helper: Extract items from DOM
  const extractFromDOM = (root) => {
    const products = [];
    const items = root.querySelectorAll('.offer-list-row-offer, .sm-offer-item, [class*="offer-item"]');
    items.forEach(item => {
      // Find the primary product link (avoiding 'Find Similar' or ads)
      const allLinks = Array.from(item.querySelectorAll('a'));
      const linkEl = allLinks.find(a => a.href.includes('detail.1688.com/offer/')) || allLinks[0];

      const titleEl = item.querySelector('.title, .offer-title, [class*="subject"], [title]');
      const priceEl = item.querySelector('.price, .offer-price, [class*="price"]');

      // Specifically target the main product image (usually the largest one or first in a specific container)
      const imgEl = item.querySelector('.img-container img, .offer-image img, [class*="image"] img') || item.querySelector('img');

      if (linkEl) {
        products.push({
          title: (titleEl ? (titleEl.innerText || titleEl.getAttribute('title')) : '').trim(),
          url: linkEl.href,
          imageUrl: imgEl ? (imgEl.src || imgEl.getAttribute('data-src') || imgEl.getAttribute('src')) : '',
          price: (priceEl ? priceEl.innerText : '').trim()
        });
      }
    });
    return products;
  };

  // 2. Check if we are already on the correct search page
  // This bypasses 'fetch' blocks by using the data already rendered in the browser.
  if (typeof window !== 'undefined') {
    const loc = window.location.href;
    if (loc.includes('offer_search.htm') || loc.includes('s.1688.com')) {
      const antiBotStatus = detectAntiBot();
      if (antiBotStatus) {
        return {
          error: 'agent_blocked',
          reason: antiBotStatus,
          hint: '1688 security triggered. Please solve the captcha or login in the active browser tab manually before the agent can proceed.'
        };
      }

      let products = [];
      if (window.__INIT_DATA) products = extractFromInitData(window.__INIT_DATA);
      if (products.length === 0 && document) products = extractFromDOM(document);

      if (products.length > 0) return { keyword, count: products.length, products, source: 'active_tab' };
    }
  }

  // 3. Fallback to Fetch if not on page or extraction failed
  const searchUrl = `https://s.1688.com/selloffer/offer_search.htm?keywords=${encodeURIComponent(keyword)}&_input_charset=utf-8&n=y&netType=1%2C11`;

  try {
    const resp = await fetch(searchUrl, { credentials: 'include' });
    if (resp.ok) {
      const text = await resp.text();
      const initDataMatch = text.match(/window\.__INIT_DATA[\s=]+({.+?})[\s;]*<\/script>/s);
      if (initDataMatch && initDataMatch[1]) {
        const initData = JSON.parse(initDataMatch[1]);
        const products = extractFromInitData(initData);
        if (products.length > 0) return { keyword, count: products.length, products, source: 'fetch' };
      }

      // Secondary fallback: Parse fetched HTML
      const parser = new DOMParser();
      const doc = parser.parseFromString(text, 'text/html');
      const products = extractFromDOM(doc);
      if (products.length > 0) return { keyword, count: products.length, products, source: 'fetch_dom' };
    }
  } catch (e) {
    console.warn('Fetch failed, likely due to anti-bot:', e);
  }

  return {
    error: 'Data extraction failed',
    hint: '1688 may be blocking requests. Please try opening the search page manually in the browser first: ' + searchUrl
  };
}
