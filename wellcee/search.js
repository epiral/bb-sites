/* @meta
{
  "name": "wellcee/search",
  "description": "Wellcee 唯心所寓公开房源检索 (rental listings: price, community, room type, source)",
  "domain": "www.wellcee.com",
  "args": {
    "city": {"required": false, "description": "City name, default Shanghai"},
    "district": {"required": false, "description": "Local district filter on the first loaded page"},
    "query": {"required": false, "description": "Local text filter on loaded listing text"},
    "property_type": {"required": false, "description": "whole, share, short, or long"},
    "min_area": {"required": false, "description": "Minimum area in square meters"},
    "max_area": {"required": false, "description": "Maximum area in square meters"},
    "min_price": {"required": false, "description": "Minimum monthly rent"},
    "max_price": {"required": false, "description": "Maximum monthly rent"},
    "limit": {"required": false, "description": "Returned count, default 20, max 20"}
  },
  "params": {
    "city": {"type": "string", "required": false},
    "district": {"type": "string", "required": false},
    "query": {"type": "string", "required": false},
    "property_type": {"type": "string", "required": false, "enum": ["whole", "share", "short", "long"]},
    "min_area": {"type": "number", "required": false},
    "max_area": {"type": "number", "required": false},
    "min_price": {"type": "number", "required": false},
    "max_price": {"type": "number", "required": false},
    "limit": {"type": "number", "required": false}
  },
  "auth": "none",
  "profile": "required",
  "side_effect": "read_only",
  "retry_safety": "safe_with_backoff",
  "max_concurrency": 1,
  "serialization_key": "site:wellcee",
  "output_modes": ["legacy", "envelope_v1"],
  "timeout_class": "standard",
  "envelope_versions": ["pinix.site-result-envelope.v1"],
  "readOnly": true,
  "example": "pinixc site wellcee search --city 上海 --district 徐汇区 --limit 10 --profile default --envelope v1"
}
*/

const SITE_RESULT_VERSION = 'pinix.site-adapter-result.v1';
const CITY_SLUGS = {
  上海: 'shanghai', shanghai: 'shanghai',
  北京: 'beijing', beijing: 'beijing',
  深圳: 'shenzhen', shenzhen: 'shenzhen',
  广州: 'guangzhou', guangzhou: 'guangzhou',
  杭州: 'hangzhou', hangzhou: 'hangzhou',
  成都: 'chengdu', chengdu: 'chengdu',
  西安: 'xian', xian: 'xian',
  南京: 'nanjing', nanjing: 'nanjing',
  苏州: 'suzhou', suzhou: 'suzhou',
  武汉: 'wuhan', wuhan: 'wuhan',
  长沙: 'changsha', changsha: 'changsha',
  重庆: 'chongqing', chongqing: 'chongqing',
  天津: 'tianjin', tianjin: 'tianjin',
  宁波: 'ningbo', ningbo: 'ningbo',
  厦门: 'xiamen', xiamen: 'xiamen',
  合肥: 'hefei', hefei: 'hefei',
  青岛: 'qingdao', qingdao: 'qingdao',
  无锡: 'wuxi', wuxi: 'wuxi',
  大连: 'dalian', dalian: 'dalian',
  福州: 'fuzhou', fuzhou: 'fuzhou',
  东莞: 'dongguan', dongguan: 'dongguan',
  南昌: 'nanchang', nanchang: 'nanchang',
  昆明: 'kunming', kunming: 'kunming',
  贵阳: 'guiyang', guiyang: 'guiyang',
  济南: 'jinan', jinan: 'jinan',
  郑州: 'zhengzhou', zhengzhou: 'zhengzhou',
  温州: 'wenzhou', wenzhou: 'wenzhou',
  南宁: 'nanning', nanning: 'nanning',
  泉州: 'quanzhou', quanzhou: 'quanzhou',
  常州: 'changzhou', changzhou: 'changzhou',
  三亚: 'sanya', sanya: 'sanya',
  佛山: 'foshan', foshan: 'foshan',
  珠海: 'zhuhai', zhuhai: 'zhuhai',
  金华: 'jinhua', jinhua: 'jinhua',
  南通: 'nantong', nantong: 'nantong',
  中山: 'zhongshan', zhongshan: 'zhongshan',
  石家庄: 'shijiazhuang', shijiazhuang: 'shijiazhuang',
  太原: 'taiyuan', taiyuan: 'taiyuan',
  徐州: 'xuzhou', xuzhou: 'xuzhou'
};

const DISTRICTS = ['黄浦', '徐汇', '长宁', '静安', '普陀', '虹口', '杨浦', '闵行', '宝山', '嘉定', '浦东', '金山', '松江', '青浦', '奉贤', '崇明'];

function errorResult(error, hint, code) {
  return {error, hint, ...(code ? {code} : {})};
}

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeDistrict(value) {
  return normalizeText(value).replace(/区$/, '');
}

function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function clampLimit(value) {
  const parsed = parseInt(value);
  return Math.min(Math.max(Number.isFinite(parsed) ? parsed : 20, 1), 20);
}

function clampNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function canonicalURL(raw) {
  try {
    const url = new URL(raw);
    if (!/(^|\.)wellcee\.com$/i.test(url.hostname)) return null;
    if (!/\/rent-apartment\//i.test(url.pathname)) return null;
    return 'https://www.wellcee.com' + url.pathname;
  } catch {
    return null;
  }
}

function detectPropertyType(text) {
  const value = normalizeText(text);
  if (/整租/.test(value)) return 'whole';
  if (/合租/.test(value)) return 'share';
  if (/短租/.test(value)) return 'short';
  if (/长租/.test(value)) return 'long';
  return null;
}

function parseDistrictAndCommunity(name, city) {
  const value = normalizeText(name);
  const district = DISTRICTS.find(item => value === item || value.startsWith(item + ' ')) || null;
  const community = district ? value.slice(district.length).trim() || null : (value || null);
  return {city, district, community};
}

function roleClue(text) {
  const match = normalizeText(text).match(/房东本人直租|房东直租|无中介费|中介/);
  if (!match) return {role_hint: null, role_clue: null};
  return {
    role_hint: /房东/.test(match[0]) ? 'self_claim' : 'listing_text_clue',
    role_clue: match[0]
  };
}

function buildCarrier(data, metadata) {
  return {
    __pinix_site_result: {version: SITE_RESULT_VERSION, metadata},
    data
  };
}

function pageExpression() {
  return `(() => {
    const clean = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
    const bodyText = document.body ? document.body.innerText || '' : '';
    const scripts = Array.from(document.scripts || []);
    let itemList = null;
    for (const script of scripts) {
      if (script.type !== 'application/ld+json') continue;
      try {
        const value = JSON.parse(script.textContent || 'null');
        if (value && value['@type'] === 'ItemList') { itemList = value; break; }
      } catch {}
    }
    const anchors = Array.from(document.querySelectorAll('a[href]'));
    const items = (itemList && Array.isArray(itemList.itemListElement) ? itemList.itemListElement : []).map((entry) => {
      const item = entry && entry.item ? entry.item : entry;
      const href = item && item.url ? String(item.url) : '';
      const anchor = anchors.find(a => a.href === href || a.href.split('?')[0] === href.split('?')[0]);
      return {
        position: entry && entry.position || null,
        url: href,
        name: item && item.name || null,
        datePosted: item && item.datePosted || null,
        offers: item && item.offers ? {price: item.offers.price, priceCurrency: item.offers.priceCurrency, availability: item.offers.availability} : null,
        address: item && item.address ? {addressLocality: item.address.addressLocality, addressRegion: item.address.addressRegion, streetAddress: item.address.streetAddress} : null,
        card_text: anchor ? clean(anchor.innerText) : ''
      };
    });
    const pagination = clean(bodyText).match(/(?:^|\\n)(\\d+)\\s*\\n(?:\\d+)\\s*\\n(?:\\d+)\\s*\\n(?:\\d+)\\s*\\n(?:\\d+)$/m);
    return {
      readyState: document.readyState,
      title: document.title || '',
      url: location.href,
      bodyText: bodyText.slice(0, 12000),
      items,
      itemListName: itemList && itemList.name || null,
      itemCount: itemList && itemList.numberOfItems || items.length,
      hasEmptyState: /暂无房源|没有找到|无房源|no listings|no results/i.test(bodyText),
      hasBlockState: /cloudflare|captcha|access denied|security verification|安全验证|验证码|访问被拒绝/i.test((document.title || '') + '\\n' + bodyText),
      pagination_hint: pagination ? pagination[1] : null
    };
  })()`;
}

function parseListing(raw, city) {
  const canonical = canonicalURL(raw.url);
  if (!canonical) return null;
  const location = parseDistrictAndCommunity(raw.name, city);
  const text = normalizeText(raw.card_text);
  const price = numberOrNull(raw.offers && raw.offers.price);
  const visibleRoomType = (text.match(/整租|合租|短租|长租/) || [])[0] || null;
  const role = roleClue(text);
  return {
    listing_id: canonical.split('/').pop(),
    title: normalizeText(raw.name) || null,
    community: location.community,
    city,
    district: location.district,
    address: normalizeText(raw.address && (raw.address.streetAddress || raw.address.addressRegion)) || normalizeText(raw.name) || null,
    price,
    currency: normalizeText(raw.offers && raw.offers.priceCurrency) || null,
    room_type: visibleRoomType,
    property_type: detectPropertyType(text),
    area_m2: null,
    floor: null,
    bathrooms: null,
    amenities: [],
    summary: text || null,
    description: null,
    availability: normalizeText(raw.offers && raw.offers.availability) || null,
    datePosted: raw.datePosted || null,
    last_login: (text.match(/最后登录\s*(\d{4}-\d{2}-\d{2})/) || [])[1] || null,
    role_hint: role.role_hint,
    role_clue: role.role_clue,
    profile_url: null,
    source_url: canonical
  };
}

function matchesListing(listing, args, city) {
  const district = normalizeDistrict(args.district);
  if (district && normalizeDistrict(listing.district) !== district) return {match: false, unknown: false};
  const query = normalizeText(args.query).toLowerCase();
  if (query) {
    const haystack = [listing.title, listing.community, listing.summary, listing.description].filter(Boolean).join(' ').toLowerCase();
    if (!haystack.includes(query)) return {match: false, unknown: false};
  }
  if (args.property_type && listing.property_type === null) return {match: false, unknown: true, field: 'property_type'};
  if (args.property_type && listing.property_type !== args.property_type) return {match: false, unknown: false};
  const minArea = clampNumber(args.min_area);
  const maxArea = clampNumber(args.max_area);
  if ((minArea !== null || maxArea !== null) && listing.area_m2 === null) return {match: false, unknown: true, field: 'area_m2'};
  if (minArea !== null && listing.area_m2 < minArea) return {match: false, unknown: false};
  if (maxArea !== null && listing.area_m2 > maxArea) return {match: false, unknown: false};
  const minPrice = clampNumber(args.min_price);
  const maxPrice = clampNumber(args.max_price);
  if ((minPrice !== null || maxPrice !== null) && listing.price === null) return {match: false, unknown: true, field: 'price'};
  if (minPrice !== null && listing.price < minPrice) return {match: false, unknown: false};
  if (maxPrice !== null && listing.price > maxPrice) return {match: false, unknown: false};
  return {match: true, unknown: false, city};
}

module.exports = async function(args) {
  const cityInput = normalizeText(args.city) || '上海';
  const citySlug = CITY_SLUGS[cityInput] || CITY_SLUGS[cityInput.toLowerCase()];
  if (!citySlug) return errorResult('Invalid argument: city', 'Use a Wellcee public city such as 上海 or shanghai.', 'INVALID_ARGUMENT');

  const propertyTypes = new Set(['whole', 'share', 'short', 'long']);
  if (args.property_type && !propertyTypes.has(String(args.property_type))) {
    return errorResult('Invalid argument: property_type', 'Use whole, share, short, or long.', 'INVALID_ARGUMENT');
  }
  const minArea = clampNumber(args.min_area);
  const maxArea = clampNumber(args.max_area);
  const minPrice = clampNumber(args.min_price);
  const maxPrice = clampNumber(args.max_price);
  if (minArea !== null && maxArea !== null && minArea > maxArea) return errorResult('Invalid argument: min_area', 'min_area must not exceed max_area.', 'INVALID_ARGUMENT');
  if (minPrice !== null && maxPrice !== null && minPrice > maxPrice) return errorResult('Invalid argument: min_price', 'min_price must not exceed max_price.', 'INVALID_ARGUMENT');

  const limit = clampLimit(args.limit);
  const listUrl = 'https://www.wellcee.com/cn/rent-apartment/' + citySlug + '/list';
  let page;
  try {
    const tab = await browser.open(listUrl);
    if (tab.waitForSelector) await tab.waitForSelector('body', 10000);
    page = await tab.eval(pageExpression());
  } catch (error) {
    return errorResult('Wellcee page fetch failed', 'The public page could not be opened or inspected. Retry slowly; an Edge disconnect or timeout is not an empty result.', 'NETWORK_ERROR');
  }

  const observedAt = new Date().toISOString();
  if (!page || page.hasBlockState) return errorResult('Wellcee access blocked', 'The page appears to be a verification or access-denied response. Open Wellcee manually and retry later; do not bypass the challenge.', 'BLOCKED');
  if (!page.readyState || !Array.isArray(page.items)) return errorResult('Wellcee page not ready', 'The public listing page did not expose its SSR/JSON-LD listing payload.', 'PAGE_NOT_READY');

  const parsed = page.items.map(item => parseListing(item, cityInput)).filter(Boolean);
  const filterStats = {unknown_area: 0, unknown_price: 0, unknown_property_type: 0, filtered: 0};
  const filtered = [];
  for (const listing of parsed) {
    const result = matchesListing(listing, args, cityInput);
    if (result.match) filtered.push(listing);
    else {
      filterStats.filtered += 1;
      if (result.unknown && result.field) {
        const statName = result.field === 'area_m2' ? 'unknown_area' : result.field === 'price' ? 'unknown_price' : 'unknown_' + result.field;
        filterStats[statName] = (filterStats[statName] || 0) + 1;
      }
    }
  }
  const listings = filtered.slice(0, limit);
  const directEmpty = page.items.length === 0 && page.hasEmptyState === true;
  const noVerifiedMatch = !directEmpty && listings.length === 0 && (parsed.length > 0 || Object.values(filterStats).some(Boolean));
  const completeness = directEmpty ? 'empty' : 'partial';
  const reason = directEmpty ? 'no_results' : (noVerifiedMatch ? 'no_verified_match' : 'first_page_only');
  const warnings = [
    {code: 'FIRST_PAGE_ONLY', message: 'Only the public first page was loaded; the result is not a full market listing.'},
    {code: 'UNVERIFIED_LISTING_STATUS', message: 'Wellcee availability and datePosted are page claims, not a verified current-rental or freshness guarantee.'}
  ];
  if (args.district || args.query || args.property_type || minArea !== null || maxArea !== null || minPrice !== null || maxPrice !== null) {
    warnings.push({code: 'LOCAL_FILTER_ONLY', message: 'Filters were applied locally to fields visible in the loaded first page; query is not a Wellcee server-side search.'});
  }
  if (noVerifiedMatch) warnings.push({code: 'NO_VERIFIED_MATCH', message: 'No loaded listing matched all requested filters; this does not prove the city has no matching homes.'});
  if (filterStats.unknown_area || filterStats.unknown_price || filterStats.unknown_property_type) {
    warnings.push({code: 'UNKNOWN_FILTER_FIELDS', message: 'Some loaded listings lacked a directly visible area, price, or property type and were not guessed into the result.'});
  }

  const data = {
    city: cityInput,
    city_slug: citySlug,
    district: normalizeText(args.district) || null,
    query: normalizeText(args.query) || null,
    property_type: args.property_type || null,
    min_area_m2: minArea,
    max_area_m2: maxArea,
    min_price: minPrice,
    max_price: maxPrice,
    limit,
    observed_at: observedAt,
    count: listings.length,
    listings
  };
  return buildCarrier(data, {
    effective_args: {
      city: cityInput,
      city_slug: citySlug,
      district: normalizeText(args.district) || null,
      query: normalizeText(args.query) || null,
      property_type: args.property_type || null,
      min_area: minArea,
      max_area: maxArea,
      min_price: minPrice,
      max_price: maxPrice,
      limit
    },
    completeness,
    reason,
    source: {url: listUrl},
    pagination: {
      supported: false,
      mode: 'first_page_only',
      page: 1,
      visible_on_page: parsed.length,
      returned: listings.length,
      limit,
      filtered: filterStats.filtered,
      filter_unknown_area: filterStats.unknown_area || 0,
      filter_unknown_price: filterStats.unknown_price || 0,
      filter_unknown_property_type: filterStats.unknown_property_type || 0
    },
    auth: {authenticated_as: 'not_applicable'},
    warnings
  });
};
