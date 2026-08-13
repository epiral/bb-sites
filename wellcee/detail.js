/* @meta
{
  "name": "wellcee/detail",
  "description": "Wellcee 唯心所寓公开房源详情 (rental listing detail: price, area, room type, amenities, source)",
  "domain": "www.wellcee.com",
  "args": {
    "listing_id": {"required": false, "description": "Numeric Wellcee listing ID"},
    "url": {"required": false, "description": "Public Wellcee listing URL"}
  },
  "params": {
    "listing_id": {"type": "string", "required": false},
    "url": {"type": "string", "required": false}
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
  "example": "pinixc site wellcee detail --listing-id 1744041347935616 --profile default --envelope v1"
}
*/

const SITE_RESULT_VERSION = 'pinix.site-adapter-result.v1';

function errorResult(error, hint, code) {
  return {error, hint, ...(code ? {code} : {})};
}

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function canonicalDetailURL(raw) {
  try {
    const url = new URL(raw);
    if (!/(^|\.)wellcee\.com$/i.test(url.hostname)) return null;
    const match = url.pathname.match(/\/rent-apartment\/(?:[^/]+\/)?(\d+)(?:\/)?$/i);
    if (!match) return null;
    return {listingId: match[1], url: 'https://www.wellcee.com/rent-apartment/' + match[1]};
  } catch {
    return null;
  }
}

function propertyType(roomType) {
  const value = clean(roomType);
  if (/整租/.test(value)) return 'whole';
  if (/合租/.test(value)) return 'share';
  if (/短租/.test(value)) return 'short';
  if (/长租/.test(value)) return 'long';
  return null;
}

function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function roleClue(description) {
  const match = clean(description).match(/房东本人直租|房东直租|无中介费|中介/);
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
    let listing = null;
    for (const script of Array.from(document.scripts || [])) {
      if (script.type !== 'application/ld+json') continue;
      try {
        const value = JSON.parse(script.textContent || 'null');
        if (value && value['@type'] === 'RealEstateListing') { listing = value; break; }
      } catch {}
    }
    const profile = Array.from(document.querySelectorAll('a[href*="/user/"]'))
      .map(a => a.href)
      .find(href => /^https?:\\/\\/([^/]+\\.)?wellcee\\.com\\/user\\/\\d+/.test(href)) || null;
    return {
      readyState: document.readyState,
      title: document.title || '',
      heading: clean(document.querySelector('h1') && document.querySelector('h1').innerText),
      bodyText: bodyText.slice(0, 18000),
      listing,
      profile_url: profile,
      hasBlockState: /cloudflare|captcha|access denied|security verification|安全验证|验证码|访问被拒绝/i.test((document.title || '') + '\\n' + bodyText),
      hasNotFoundState: /404|not found|房源已下架|房源不存在|未找到房源/i.test((document.title || '') + '\\n' + bodyText)
    };
  })()`;
}

function lineValue(text, label) {
  const match = String(text || '').match(new RegExp(label + '\\s*([^\\n]+)'));
  return match ? clean(match[1]) : null;
}

function canonicalProfile(raw) {
  try {
    const url = new URL(raw);
    if (!/(^|\.)wellcee\.com$/i.test(url.hostname) || !/^\/user\/\d+/.test(url.pathname)) return null;
    return 'https://www.wellcee.com' + url.pathname;
  } catch {
    return null;
  }
}

module.exports = async function(args) {
  const listingIdArg = args['listing-id'] !== undefined ? args['listing-id'] : args.listing_id;
  const hasListingId = listingIdArg !== undefined && listingIdArg !== null && listingIdArg !== '';
  if (args.url && hasListingId) return errorResult('Provide only one of url or listing_id', 'Choose --url or --listing-id, not both.', 'INVALID_ARGUMENT');
  let target = null;
  if (args.url) target = canonicalDetailURL(String(args.url));
  else if (hasListingId) {
    const id = String(listingIdArg).trim();
    if (/^\d+$/.test(id)) target = {listingId: id, url: 'https://www.wellcee.com/rent-apartment/' + id};
  }
  if (!target) return errorResult('Missing or invalid argument: listing_id/url', 'Provide a numeric --listing-id or a public Wellcee detail --url.', 'INVALID_ARGUMENT');

  let page;
  try {
    const tab = await browser.open(target.url);
    if (tab.waitForSelector) await tab.waitForSelector('body', 10000);
    page = await tab.eval(pageExpression());
  } catch (error) {
    return errorResult('Wellcee detail fetch failed', 'The public detail page could not be opened or inspected. Retry slowly; an Edge disconnect or timeout is not a missing listing.', 'NETWORK_ERROR');
  }
  if (!page || page.hasBlockState) return errorResult('Wellcee access blocked', 'The page appears to be a verification or access-denied response. Open Wellcee manually and retry later; do not bypass the challenge.', 'BLOCKED');
  if (page.hasNotFoundState && !page.listing) return errorResult('Wellcee listing not found', 'Check the listing ID or public detail URL.', 'NOT_FOUND');
  if (!page.readyState || !page.listing || page.listing['@type'] !== 'RealEstateListing') return errorResult('Wellcee detail parse failed', 'The page did not expose a RealEstateListing JSON-LD record.', 'PAGE_PARSE_ERROR');

  const ld = page.listing;
  const address = ld.address || {};
  const roomType = lineValue(page.bodyText, '类型');
  const areaText = lineValue(page.bodyText, '面积');
  const floorText = lineValue(page.bodyText, '楼层');
  const bathroomText = lineValue(page.bodyText, '房间');
  const description = clean(ld.description) || null;
  const role = roleClue(description);
  const amenities = Array.isArray(ld.amenityFeature) ? ld.amenityFeature.map(item => clean(item && item.name)).filter(Boolean) : [];
  const profileUrl = canonicalProfile(page.profile_url);
  const listing = {
    listing_id: target.listingId,
    title: page.heading || clean(ld.name) || null,
    community: clean(address.streetAddress) || clean(ld.name) || null,
    city: clean(address.addressLocality) || null,
    district: clean(address.addressRegion) || null,
    address: clean(address.streetAddress) || clean(ld.name) || null,
    price: numberOrNull(ld.offers && ld.offers.price),
    currency: clean(ld.offers && ld.offers.priceCurrency) || null,
    room_type: roomType,
    property_type: propertyType(roomType),
    area_m2: numberOrNull(areaText && areaText.match(/[0-9]+(?:\.[0-9]+)?/)?.[0] || ld.floorSize && ld.floorSize.value),
    floor: floorText,
    bathrooms: numberOrNull(bathroomText && bathroomText.match(/([0-9]+)\s*洗手间/)?.[1]) || numberOrNull(ld.numberOfBathroomsTotal),
    amenities,
    description,
    availability: clean(ld.offers && ld.offers.availability) || null,
    datePosted: ld.datePosted || null,
    last_login: lineValue(page.bodyText, '最后登录'),
    role_hint: role.role_hint,
    role_clue: role.role_clue,
    profile_url: profileUrl,
    source_url: target.url,
    phone: null,
    elevator: null,
    decoration: null,
    orientation: null,
    updated_at: null
  };
  const unknownFields = ['phone', 'elevator', 'decoration', 'orientation', 'updated_at'].filter(field => listing[field] === null);
  const warnings = [
    {code: 'UNVERIFIED_LISTING_STATUS', message: 'availability and datePosted are raw page declarations; they do not prove current availability or freshness.'},
    {code: 'UNKNOWN_OPTIONAL_FIELDS', message: 'Missing phone, elevator, decoration, orientation, and updated_at remain null rather than being inferred.'}
  ];
  if (listing.role_hint) warnings.push({code: 'ROLE_HINT_SELF_CLAIM', message: 'role_hint is a listing-text clue only; it does not verify landlord or broker identity.'});

  const data = {
    observed_at: new Date().toISOString(),
    listing,
    unknown_fields: unknownFields
  };
  return buildCarrier(data, {
    effective_args: {listing_id: target.listingId, url: target.url},
    completeness: listing.title && listing.price !== null ? 'complete' : 'partial',
    reason: listing.title && listing.price !== null ? 'detail_page' : 'partial_parse',
    source: {url: target.url},
    pagination: {supported: false, returned: 1},
    auth: {authenticated_as: 'not_applicable'},
    warnings
  });
};
