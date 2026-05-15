/* @meta
{
  "name": "1688/detail",
  "description": "Robust product detail extraction on 1688 using active tab or fetch",
  "domain": "detail.1688.com",
  "args": {
    "urlOrId": {"required": true, "description": "1688 Product Offer ID or Full URL"}
  },
  "capabilities": ["network", "browser"],
  "readOnly": true,
  "example": "bb-browser site 1688/detail 12345678"
}
*/

async function(args) {
  if (!args.urlOrId) return { error: 'Missing argument: urlOrId' };

  let offerId = args.urlOrId;
  const matchUrl = args.urlOrId.match(/offer\/(\d+)\.html/);
  if (matchUrl) {
    offerId = matchUrl[1];
  } else if (!/^\d+$/.test(offerId)) {
    return { error: 'Invalid urlOrId format', hint: 'Must be a numeric offer ID or detail.1688.com URL' };
  }

  const targetUrl = `https://detail.1688.com/offer/${offerId}.html`;

  const extractFromInitData = (initData) => {
    const details = { url: targetUrl, title: '', price: '', imageUrl: '', attributes: {}, reviews: [], shop: {}, inventory: 0 };
    const globalData = initData?.globalData || initData?.data || {};

    if (globalData.title) details.title = globalData.title;
    if (globalData.images && globalData.images.length > 0) details.imageUrl = globalData.images[0];

    if (globalData.skuModel?.skuPriceScale) {
      details.price = globalData.skuModel.skuPriceScale;
    } else if (globalData.orderParamModel?.orderParam?.price) {
      details.price = globalData.orderParamModel.orderParam.price;
    }

    if (Array.isArray(globalData.skuModel?.skuProps)) {
      globalData.skuModel.skuProps.forEach(prop => {
        details.attributes[prop.prop] = prop.value?.map(v => v.name).join(', ');
      });
    }
    if (Array.isArray(globalData.moduleData?.components)) {
      const propComponent = globalData.moduleData.components.find(c => c.componentType === 'customAttribute');
      if (propComponent?.data?.attributes) {
        propComponent.data.attributes.forEach(attr => {
          details.attributes[attr.name] = attr.value;
        });
      }
    }

    // Extract extra shop/factory details for agent decision support
    const companyData = globalData.company || globalData.shopInfo || {};
    if (companyData) {
       details.shop = {
         name: companyData.name || companyData.shopName || '',
         isFactory: companyData.isFactory || false,
         province: companyData.province || '',
         city: companyData.city || '',
         starRating: companyData.starLevel || companyData.starRating || ''
       };
    }
    return details;
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

  // 1. Check if we are already on the correct detail page
  if (typeof window !== 'undefined' && window.location.href.includes(offerId)) {
    const antiBotStatus = detectAntiBot();
    if (antiBotStatus) {
      return {
        error: 'agent_blocked',
        reason: antiBotStatus,
        hint: '1688 security triggered. Please solve the captcha or login in the active browser tab manually before extracting details.'
      };
    }

    if (window.__INIT_DATA) {
      const data = extractFromInitData(window.__INIT_DATA);
      if (data.title) return { ...data, source: 'active_tab' };
    }
  }

  // 2. Fallback to Fetch
  try {
    const resp = await fetch(targetUrl, { credentials: 'include' });
    if (resp.ok) {
      const text = await resp.text();
      const initDataMatch = text.match(/window\.__INIT_DATA[\s=]+({.+?})[\s;]*<\/script>/s);
      if (initDataMatch && initDataMatch[1]) {
        const data = extractFromInitData(JSON.parse(initDataMatch[1]));
        if (data.title) return { ...data, source: 'fetch' };
      }

      // Basic Regex Fallback for fetched HTML
      const titleMatch = text.match(/<h1[^>]*>([^<]+)<\/h1>/) || text.match(/<title>([^<]+)<\/title>/);
      const imgMatch = text.match(/<img[^>]+id="dt-tab-0"[^>]+src="([^"]+)"/i);
      const priceMatch = text.match(/<span[^>]+class="price[^"]*"[^>]*>([^<]+)<\/span>/i);

      return {
        url: targetUrl,
        title: titleMatch ? titleMatch[1].trim() : '',
        imageUrl: imgMatch ? imgMatch[1] : '',
        price: priceMatch ? priceMatch[1].trim() : '',
        source: 'fetch_regex'
      };
    }
  } catch (e) {
    console.warn('Fetch failed for 1688 detail:', e);
  }

  return {
    error: 'Data extraction failed',
    hint: 'Please try opening the product page manually in the browser first: ' + targetUrl
  };
}
