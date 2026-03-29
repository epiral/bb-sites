/* @meta
{
  "name": "nsmc/cart-stats",
  "description": "获取 NSMC DataPortal 购物车统计、配额信息和购物车大小",
  "domain": "satellite.nsmc.org.cn",
  "args": {},
  "capabilities": ["network"],
  "readOnly": true,
  "example": "bb-browser site nsmc/cart-stats"
}
*/

async function(args) {
  let cachedTokenPromise = null;
  const formatBytes = (bytes) => {
    const n = Number(bytes || 0);
    if (!Number.isFinite(n)) return null;
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let value = n;
    let idx = 0;
    while (value >= 1024 && idx < units.length - 1) {
      value /= 1024;
      idx++;
    }
    return value.toFixed(idx === 0 ? 0 : 2) + ' ' + units[idx];
  };
  async function getToken() {
    if (!cachedTokenPromise) {
      cachedTokenPromise = fetch('/DataPortal/v1/data/selection/token', {credentials: 'include'})
        .then(async (resp) => {
          if (!resp.ok) throw new Error('Token HTTP ' + resp.status);
          const data = await resp.json().catch(() => null);
          if (!data || data.status !== 1 || !data.resource) throw new Error(data?.message || 'Failed to get CSRF token');
          return data.resource;
        });
    }
    return cachedTokenPromise;
  }
  async function apiFetch(url, options = {}) {
    const token = await getToken();
    const headers = new Headers(options.headers || {});
    if (!headers.has('Csrf-Token')) headers.set('Csrf-Token', token);
    return fetch(url, {...options, credentials: 'include', headers});
  }

  try {
    const [statsResp, sizeResp] = await Promise.all([
      apiFetch('/DataPortal/v1/data/cart/substats'),
      apiFetch('/DataPortal/v1/data/cart/subsize')
    ]);
    if (!statsResp.ok) return {error: 'cart/substats HTTP ' + statsResp.status, hint: 'Please log in to the NSMC DataPortal first'};
    if (!sizeResp.ok) return {error: 'cart/subsize HTTP ' + sizeResp.status, hint: 'Please log in to the NSMC DataPortal first'};

    const statsData = await statsResp.json().catch(() => null);
    const sizeData = await sizeResp.json().catch(() => null);
    if (!statsData || !sizeData) return {error: 'Invalid JSON response'};
    if (statsData.status !== 1) return {error: statsData.message || ('API status ' + statsData.status), status: statsData.status};
    if (sizeData.status !== 1) return {error: sizeData.message || ('API status ' + sizeData.status), status: sizeData.status};

    const stats = statsData.resource || {};
    const size = sizeData.resource || {};
    const summary = {
      cartFileCount: Number(stats.subFileCount || stats.fileCount || stats.shopcount || 0),
      cartSizeBytes: Number(size.sizeOfShop || stats.subFileSize || stats.sizeOfShop || 0),
      cartSizeHuman: formatBytes(size.sizeOfShop || stats.subFileSize || stats.sizeOfShop || 0),
      orderedSizeBytes: Number(size.sizeOfOrd || 0),
      orderedSizeHuman: formatBytes(size.sizeOfOrd || 0),
      totalOrdAndShopBytes: Number(size.sizeOfOrdAndShop || 0),
      totalOrdAndShopHuman: formatBytes(size.sizeOfOrdAndShop || 0),
      maxFileDownloadCount: size.maxfiledownloadcount || null,
      remainDmzFileSizeBytes: stats.remainDmzFileSize != null ? Number(stats.remainDmzFileSize) : null,
      remainDmzFileSizeHuman: stats.remainDmzFileSize != null ? formatBytes(stats.remainDmzFileSize) : null
    };

    return {
      summary,
      stats,
      size
    };
  } catch (error) {
    return {error: error.message || String(error)};
  }
}
