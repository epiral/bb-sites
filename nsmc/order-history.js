/* @meta
{
  "name": "nsmc/order-history",
  "description": "按日期范围获取 NSMC DataPortal 历史订单",
  "domain": "satellite.nsmc.org.cn",
  "args": {
    "beginDate": {"required": true, "description": "开始日期，格式 YYYY-MM-DD"},
    "endDate": {"required": true, "description": "结束日期，格式 YYYY-MM-DD"},
    "beginTime": {"required": false, "description": "开始时间，默认 00:00:00"},
    "endTime": {"required": false, "description": "结束时间，默认 23:59:59"}
  },
  "capabilities": ["network"],
  "readOnly": true,
  "example": "bb-browser site nsmc/order-history 2026-03-01 2026-03-29"
}
*/

async function(args) {
  const beginDate = (args.beginDate || '').trim();
  const endDate = (args.endDate || '').trim();
  const beginTimePart = (args.beginTime || '00:00:00').trim();
  const endTimePart = (args.endTime || '23:59:59').trim();
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
  if (!beginDate) return {error: 'Missing argument: beginDate'};
  if (!endDate) return {error: 'Missing argument: endDate'};

  const historyStatusLabel = (code) => ({
    '7': '已删除',
    '11': '已取消'
  })[String(code)] || '已过期';

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

  const beginTime = beginDate.includes(' ') ? beginDate : `${beginDate} ${beginTimePart}`;
  const endTime = endDate.includes(' ') ? endDate : `${endDate} ${endTimePart}`;
  const params = new URLSearchParams({beginTime, endTime});

  const resp = await apiFetch('/DataPortal/v1/data/order/subhistory?' + params.toString());
  if (!resp.ok) {
    return {
      error: 'HTTP ' + resp.status,
      hint: resp.status === 401 || resp.status === 403 ? 'Please log in to the NSMC DataPortal first' : 'Order history lookup failed'
    };
  }
  const data = await resp.json().catch(() => null);
  if (!data) return {error: 'Invalid JSON response'};
  if (data.status !== 1) {
    return {
      error: data.message || ('API status ' + data.status),
      status: data.status,
      beginTime,
      endTime
    };
  }

  const orders = (Array.isArray(data.resource) ? data.resource : []).map((row) => ({
    orderinfoid: row.orderinfoid || null,
    ordercode: row.ordercode || null,
    ordertime: row.ordertime || null,
    finishtime: row.finishtime || null,
    orderstatus: row.orderstatus != null ? String(row.orderstatus) : null,
    orderstatusLabel: historyStatusLabel(row.orderstatus),
    datatotalnumber: row.datatotalnumber != null ? Number(row.datatotalnumber) : null,
    dataquantityBytes: row.dataquantity != null ? Number(row.dataquantity) : null,
    dataquantityHuman: row.dataquantity != null ? formatBytes(row.dataquantity) : null,
    fillordercount: row.fillordercount != null ? Number(row.fillordercount) : null,
    serviceCode: row.serviceCode || null,
    centerFlag: row.centerFlag != null ? row.centerFlag : null,
    cloudFlag: row.cloudFlag != null ? row.cloudFlag : null
  }));

  return {
    beginTime,
    endTime,
    count: orders.length,
    orders
  };
}
