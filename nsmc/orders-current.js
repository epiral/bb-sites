/* @meta
{
  "name": "nsmc/orders-current",
  "description": "列出 NSMC 当前所有进行中的订单，无需预先知道具体订单号",
  "domain": "satellite.nsmc.org.cn",
  "args": {},
  "capabilities": ["network"],
  "readOnly": true,
  "example": "bb-browser site nsmc/orders-current --json"
}
*/

async function(args) {
  let cachedTokenPromise = null;
  async function getToken() {
    if (!cachedTokenPromise) {
      cachedTokenPromise = fetch('/DataPortal/v1/data/selection/token', {credentials: 'include'})
        .then((resp) => resp.ok ? resp.json().catch(() => null) : null)
        .then((data) => data && data.status === 1 && data.resource ? data.resource : null)
        .catch(() => null);
    }
    return cachedTokenPromise;
  }
  async function apiFetch(url, options = {}) {
    const token = url === '/DataPortal/v1/data/selection/token' ? null : await getToken();
    const headers = new Headers(options.headers || {});
    if (token && !headers.has('Csrf-Token')) headers.set('Csrf-Token', token);
    return fetch(url, {...options, credentials: 'include', headers});
  }

  const currentStatusLabel = (code) => ({
    '0': '准备中',
    '1': '准备中',
    '2': '准备中',
    '3': '准备完成',
    '4': '准备完成',
    '5': '已过期',
    '6': '准备完成',
    '7': '已删除',
    '11': '已取消'
  })[String(code)] || null;

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

  const resp = await apiFetch('/DataPortal/v1/data/order/suborder');
  if (!resp.ok) {
    return {
      error: 'HTTP ' + resp.status,
      hint: resp.status === 401 || resp.status === 403 ? 'Please log in to the NSMC DataPortal first' : 'Current order lookup failed'
    };
  }

  const data = await resp.json().catch(() => null);
  if (!data) return {error: 'Invalid JSON response'};
  if (data.status !== 1) {
    return {
      error: data.message || ('API status ' + data.status),
      status: data.status
    };
  }

  const orders = (Array.isArray(data.resource) ? data.resource : []).map((row) => ({
    orderinfoid: row.orderinfoid || null,
    ordercode: row.ordercode || null,
    ordertime: row.ordertime || null,
    finishtime: row.finishtime || null,
    orderstatus: row.orderstatus != null ? String(row.orderstatus) : null,
    orderstatusLabel: currentStatusLabel(row.orderstatus),
    datatotalnumber: row.datatotalnumber != null ? Number(row.datatotalnumber) : null,
    dataquantityBytes: row.dataquantity != null ? Number(row.dataquantity) : null,
    dataquantityHuman: row.dataquantity != null ? formatBytes(row.dataquantity) : null,
    fillordercount: row.fillordercount != null ? Number(row.fillordercount) : null,
    serviceCode: row.serviceCode || null,
    centerFlag: row.centerFlag != null ? row.centerFlag : null,
    cloudFlag: row.cloudFlag != null ? row.cloudFlag : null,
    shippingtype: row.shippingtype || null,
    noticetype: row.noticetype || null
  }));

  return {
    count: orders.length,
    orders
  };
}
