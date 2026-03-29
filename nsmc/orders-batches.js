/* @meta
{
  "name": "nsmc/orders-batches",
  "description": "列出 NSMC 当前订单批次；默认显示简要摘要，并支持完整视图和单批次详情",
  "domain": "satellite.nsmc.org.cn",
  "args": {
    "selector": {"required": false, "description": "可选 batchNo、batchId、精确下单时间、latest 或 all"},
    "view": {"required": false, "description": "summary（默认）、detail 或 all"},
    "all": {"required": false, "description": "view=all 的布尔别名"}
  },
  "capabilities": ["network"],
  "readOnly": true,
  "example": "bb-browser site nsmc/orders-batches 1 --json"
}
*/

async function(args) {
  const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj || {}, key);
  const selector = String(args.selector || '').trim();
  const rawView = String(args.view || '').trim().toLowerCase();
  const rawAll = hasOwn(args, 'all') ? String(args.all ?? '').trim().toLowerCase() : null;
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

  const makeBatchId = (ordertime) => {
    const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(ordertime || '');
    if (!m) return null;
    return `B${m[1]}${m[2]}${m[3]}T${m[4]}${m[5]}${m[6]}`;
  };

  const deriveBatchStatus = (statuses) => {
    const labels = Array.from(new Set((statuses || []).filter(Boolean)));
    if (labels.length === 0) return null;
    if (labels.length === 1) return labels[0];

    const hasPending = labels.includes('准备中');
    const hasComplete = labels.includes('准备完成');
    if (hasPending && hasComplete && labels.every((label) => label === '准备中' || label === '准备完成')) {
      return '部分完成';
    }

    return '混合状态';
  };

  const isTruthyFlag = (value) => value === '' || ['1', 'true', 'yes', 'y', 'all', 'full'].includes(value);
  const wantsAll = selector.toLowerCase() === 'all' || selector.toLowerCase() === 'full' || rawView === 'all' || rawView === 'full' || (rawAll != null && isTruthyFlag(rawAll));

  const resp = await apiFetch('/DataPortal/v1/data/order/suborder');
  if (!resp.ok) {
    return {
      error: 'HTTP ' + resp.status,
      hint: resp.status === 401 || resp.status === 403 ? 'Please log in to the NSMC DataPortal first' : 'Current order lookup failed'
    };
  }

  const data = await resp.json().catch(() => null);
  if (!data) return {error: 'Invalid JSON response'};
  if (data.status !== 1) return {error: data.message || ('API status ' + data.status), status: data.status};

  const rows = Array.isArray(data.resource) ? data.resource.slice() : [];
  rows.sort((a, b) => String(b.ordertime || '').localeCompare(String(a.ordertime || '')));

  const groups = new Map();
  for (const row of rows) {
    const key = row.ordertime || '';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  const batches = Array.from(groups.entries()).map(([ordertime, orders], idx) => {
    const totalFiles = orders.reduce((sum, row) => sum + Number(row.datatotalnumber || 0), 0);
    const totalSizeBytes = orders.reduce((sum, row) => sum + Number(row.dataquantity || 0), 0);
    const statuses = Array.from(new Set(orders.map((row) => currentStatusLabel(row.orderstatus)).filter(Boolean)));
    const batchStatus = deriveBatchStatus(statuses);
    return {
      batchNo: idx + 1,
      batchId: makeBatchId(ordertime),
      ordertime,
      orderCount: orders.length,
      totalFiles,
      totalSizeBytes,
      totalSizeHuman: formatBytes(totalSizeBytes),
      batchStatus,
      statuses,
      ordercodes: orders.map((row) => row.ordercode),
      orders: orders.map((row) => ({
        orderinfoid: row.orderinfoid || null,
        ordercode: row.ordercode || null,
        finishtime: row.finishtime || null,
        orderstatus: row.orderstatus != null ? String(row.orderstatus) : null,
        orderstatusLabel: currentStatusLabel(row.orderstatus),
        datatotalnumber: row.datatotalnumber != null ? Number(row.datatotalnumber) : null,
        dataquantityBytes: row.dataquantity != null ? Number(row.dataquantity) : null,
        dataquantityHuman: row.dataquantity != null ? formatBytes(row.dataquantity) : null
      }))
    };
  });

  const summaries = batches.map((batch) => ({
    batchNo: batch.batchNo,
    batchId: batch.batchId,
    ordertime: batch.ordertime,
    orderCount: batch.orderCount,
    totalFiles: batch.totalFiles,
    totalSizeBytes: batch.totalSizeBytes,
    totalSizeHuman: batch.totalSizeHuman,
    batchStatus: batch.batchStatus,
    statuses: batch.statuses
  }));

  const findBatch = (value) => {
    if (!value || value.toLowerCase() === 'latest') return batches[0] || null;
    if (/^\d+$/.test(value)) return batches.find((item) => String(item.batchNo) === value) || null;
    return batches.find((item) => item.batchId === value || item.ordertime === value) || null;
  };

  if (wantsAll) {
    return {
      count: batches.length,
      view: 'all',
      batches
    };
  }

  if (selector) {
    const batch = findBatch(selector);
    if (!batch) {
      return {
        error: 'Batch not found',
        selector,
        availableBatches: summaries
      };
    }

    return {
      count: batches.length,
      view: rawView === 'summary' ? 'summary' : 'detail',
      selector,
      batch: rawView === 'summary'
        ? summaries.find((item) => item.batchNo === batch.batchNo) || null
        : batch,
      availableBatches: summaries
    };
  }

  return {
    count: summaries.length,
    view: rawView === 'detail' ? 'all' : 'summary',
    batches: rawView === 'detail' ? batches : summaries
  };
}
