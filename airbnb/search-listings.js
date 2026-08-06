/* @meta
{
  "name": "airbnb/search-listings",
  "description": "Airbnb房源搜索 - 搜索短租民宿 (listing search: name, price, rating, location, url)",
  "domain": "airbnb.com",
  "args": {
    "location": {"required": true, "description": "目的地点，如 Tokyo、Paris、New York、上海"},
    "checkIn": {"required": false, "description": "入住日期，YYYY-MM-DD格式"},
    "checkOut": {"required": false, "description": "退房日期，YYYY-MM-DD格式"},
    "guests": {"required": false, "description": "入住人数（默认1）"}
  },
  "tags": ["travel", "lodging", "rentals", "search", "perimeterx", "read-only"],
  "readOnly": true,
  "example": "bb-browser site airbnb/search-listings --location Tokyo --checkIn 2026-06-01 --checkOut 2026-06-05 --guests 2"
}
*/

async function(args) {
  // 参数校验
  const location = (args.location || '').trim();
  if (!location) {
    return {
      error: '缺少必填参数: location（目的地点）',
      hint: '请输入要搜索的目的地，例如：Tokyo、Paris、New York、上海',
      action: 'bb-browser site airbnb/search-listings --location "Tokyo"'
    };
  }

  const checkIn = (args.checkIn || '').trim();
  const checkOut = (args.checkOut || '').trim();
  const guests = (args.guests || '').trim() || '1';

  // 验证日期格式（如果提供了）
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (checkIn && !dateRegex.test(checkIn)) {
    return { error: 'checkIn 日期格式错误，应为 YYYY-MM-DD，例如 2026-06-01', hint: '请检查日期格式', action: '使用正确的日期格式重试' };
  }
  if (checkOut && !dateRegex.test(checkOut)) {
    return { error: 'checkOut 日期格式错误，应为 YYYY-MM-DD，例如 2026-06-05', hint: '请检查日期格式', action: '使用正确的日期格式重试' };
  }

  // 构建搜索 URL
  const encodedLocation = encodeURIComponent(location);
  let searchUrl = `https://www.airbnb.com/s/${encodedLocation}/homes`;

  const params = new URLSearchParams();
  params.set('adults', guests);
  if (checkIn) params.set('checkin', checkIn);
  if (checkOut) params.set('checkout', checkOut);

  const queryString = params.toString();
  if (queryString) {
    searchUrl += '?' + queryString;
  }

  // Helper: Base64 decode (atob is available in browser context)
  const decodeBase64 = (str) => {
    try {
      return atob(str);
    } catch (e) {
      return str;
    }
  };

  // Helper: extract listing ID from DemandStayListing base64 ID
  const extractListingId = (demandStayId) => {
    if (!demandStayId) return '';
    try {
      const decoded = decodeBase64(demandStayId);
      const parts = decoded.split(':');
      return parts.length > 1 ? parts[1] : decoded;
    } catch (e) {
      return demandStayId;
    }
  };

  // Helper: parse rating number from localized rating string (e.g. "4.81 (27)" -> 4.81)
  const parseRating = (ratingStr) => {
    if (!ratingStr) return null;
    const m = ratingStr.match(/([\d.]+)/);
    return m ? parseFloat(m[1]) : null;
  };

  // Helper: parse price number from price string (e.g. "$333" -> 333)
  const parsePrice = (priceStr) => {
    if (!priceStr) return null;
    const cleaned = priceStr.replace(/[^0-9.]/g, '');
    const val = parseFloat(cleaned);
    return isNaN(val) ? null : val;
  };

  // Step 1: 尝试用 fetch 获取搜索页 HTML（利用浏览器已有 Cookie/Session）
  let resp;
  try {
    resp = await fetch(searchUrl, {
      credentials: 'include',
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36'
      }
    });
  } catch (e) {
    return {
      error: '网络请求失败: ' + e.message,
      hint: '请确保网络连接正常，且已在浏览器中打开 www.airbnb.com',
      action: '请先打开 https://www.airbnb.com 再运行此命令'
    };
  }

  if (!resp.ok) {
    // PerimeterX 拦截或其他错误
    if (resp.status === 403 || resp.status === 401) {
      return {
        error: 'Airbnb 访问被拦截 (HTTP ' + resp.status + ')',
        hint: 'PerimeterX 防爬虫拦截，请确认已在浏览器中打开 airbnb.com 并完成人机验证',
        action: '在浏览器中打开 https://www.airbnb.com，确保能正常访问后刷新再试'
      };
    }
    return {
      error: '搜索页面请求失败 (HTTP ' + resp.status + ')',
      hint: 'Airbnb 服务暂时不可用或请求被拒绝',
      action: '请稍后重试'
    };
  }

  // Step 2: 解析 HTML，提取嵌入式 JSON 数据
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

  // Step 3: 从 HTML 中提取 data-deferred-state-0 script 标签内容
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  const deferredScript = doc.getElementById('data-deferred-state-0');
  if (!deferredScript || !deferredScript.textContent) {
    // 尝试查找其他可能包含搜索数据的 script 标签
    const allScripts = doc.querySelectorAll('script[type="application/json"]');
    let fallbackData = null;
    for (const s of allScripts) {
      const content = s.textContent || '';
      if (content.includes('StaysSearch') || content.includes('searchResults')) {
        fallbackData = content;
        break;
      }
    }
    if (!fallbackData) {
      return {
        error: '未能从搜索结果页面提取房源数据',
        hint: 'Airbnb 页面结构可能已更新，或需要先通过浏览器打开 airbnb.com 建立会话',
        action: '请先在浏览器中访问 https://www.airbnb.com，确保登录后重试'
      };
    }
    html = fallbackData;
  } else {
    html = deferredScript.textContent;
  }

  // Step 4: 解析 JSON
  let jsonData;
  try {
    jsonData = JSON.parse(html);
  } catch (e) {
    return {
      error: '解析搜索结果 JSON 数据失败: ' + e.message,
      hint: '数据格式异常',
      action: '请重试'
    };
  }

  // Step 5: 提取 listings
  const niobeData = jsonData.niobeClientData;
  if (!niobeData || !Array.isArray(niobeData)) {
    return {
      error: '搜索结果数据结构异常，缺少 niobeClientData',
      hint: 'Airbnb 搜索页面结构可能已更新',
      action: '请重试或报告此问题'
    };
  }

  let searchResults = [];
  for (const entry of niobeData) {
    if (entry && Array.isArray(entry) && entry[0] && entry[0].startsWith('StaysSearch:')) {
      const searchData = entry[1];
      if (searchData && searchData.data && searchData.data.presentation &&
          searchData.data.presentation.staysSearch &&
          searchData.data.presentation.staysSearch.results &&
          searchData.data.presentation.staysSearch.results.searchResults) {
        searchResults = searchData.data.presentation.staysSearch.results.searchResults;
        break;
      }
    }
  }

  if (searchResults.length === 0) {
    return {
      location: location,
      totalResults: 0,
      listings: [],
      message: '未找到相关房源',
      hint: '请尝试其他目的地或日期'
    };
  }

  // Step 6: 提取房源列表
  const listings = searchResults.map(item => {
    const listingId = extractListingId(item.demandStayListing?.id);
    const name = item.nameLocalized?.localizedStringWithTranslationPreference ||
                 item.subtitle ||
                 item.title ||
                 '';

    const priceData = item.structuredDisplayPrice?.primaryLine;
    const priceStr = priceData?.discountedPrice || '';
    const priceNum = parsePrice(priceStr);

    const ratingStr = item.avgRatingLocalized || '';
    const ratingNum = parseRating(ratingStr);

    // 从 title 推断房型
    const roomType = item.title || '';

    const imageUrl = (item.contextualPictures && item.contextualPictures.length > 0)
      ? item.contextualPictures[0].picture
      : '';

    const listingUrl = listingId
      ? `https://www.airbnb.com/rooms/${listingId}`
      : '';

    return {
      name: name,
      price: priceStr,
      priceNum: priceNum,
      rating: ratingStr,
      ratingNum: ratingNum,
      roomType: roomType,
      url: listingUrl,
      image: imageUrl,
      lat: item.demandStayListing?.location?.coordinate?.latitude || null,
      lng: item.demandStayListing?.location?.coordinate?.longitude || null,
      badges: (item.badges || []).map(b => b.text)
    };
  });

  return {
    location: location,
    totalResults: listings.length,
    listings: listings
  };
}
