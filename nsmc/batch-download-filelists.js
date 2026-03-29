/* @meta
{
  "name": "nsmc/batch-download-filelists",
  "description": "将所选当前批次的全部订单文件列表 txt 逐个下载到浏览器下载目录",
  "domain": "satellite.nsmc.org.cn",
  "args": {
    "selector": {"required": false, "description": "latest、batchNo、batchId 或精确下单时间；默认 latest"},
    "mode": {"required": false, "description": "download（默认）、preview 或 merged"},
    "delayMs": {"required": false, "description": "每个文件下载之间的延迟，单位毫秒；默认 1500"},
    "maxAttempts": {"required": false, "description": "导出行数少于预期时的重试次数；默认 3"},
    "retryDelayMs": {"required": false, "description": "每次导出重试之间的延迟，单位毫秒；默认 1200"}
  },
  "capabilities": ["network"],
  "readOnly": false,
  "example": "bb-browser site nsmc/batch-download-filelists latest --json"
}
*/

async function(args) {
  const selector = (args.selector || 'latest').trim();
  const rawMode = (args.mode || 'download').trim().toLowerCase();
  const mode = ({
    split: 'download',
    edge: 'download',
    download: 'download',
    preview: 'preview',
    merged: 'merged'
  })[rawMode] || 'download';
  const delayMs = Math.max(250, Number(args.delayMs || 1500) || 1500);
  const maxAttempts = Math.max(1, Number(args.maxAttempts || 3) || 3);
  const retryDelayMs = Math.max(250, Number(args.retryDelayMs || 1200) || 1200);
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

  const makeBatchId = (ordertime) => {
    const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(ordertime || '');
    if (!m) return null;
    return `B${m[1]}${m[2]}${m[3]}T${m[4]}${m[5]}${m[6]}`;
  };

  const parseFilename = (contentDisposition, fallback) => {
    const match = /filename="?([^"]+)"?/i.exec(contentDisposition || '');
    return match ? match[1] : fallback;
  };

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
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

  const downloadText = async (filename, text) => {
    const blob = new Blob([text], {type: 'text/plain;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    await new Promise((resolve) => setTimeout(resolve, 400));
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
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
  if (data.status !== 1) return {error: data.message || ('API status ' + data.status), status: data.status};

  const rows = Array.isArray(data.resource) ? data.resource.slice() : [];
  rows.sort((a, b) => String(b.ordertime || '').localeCompare(String(a.ordertime || '')));

  const groups = new Map();
  for (const row of rows) {
    const key = row.ordertime || '';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  const batches = Array.from(groups.entries()).map(([ordertime, orders], idx) => ({
    batchNo: idx + 1,
    batchId: makeBatchId(ordertime),
    ordertime,
    orders
  }));

  let batch = null;
  if (!selector || selector.toLowerCase() === 'latest') {
    batch = batches[0] || null;
  } else if (/^\d+$/.test(selector)) {
    batch = batches.find((item) => String(item.batchNo) === selector) || null;
  } else {
    batch = batches.find((item) => item.batchId === selector || item.ordertime === selector) || null;
  }

  if (!batch) {
    return {
      error: 'Batch not found',
      selector,
      availableBatches: batches.map((item) => ({
        batchNo: item.batchNo,
        batchId: item.batchId,
        ordertime: item.ordertime,
        orderCount: item.orders.length
      }))
    };
  }

  const downloaded = [];
  const mergedParts = [];
  for (const order of batch.orders) {
    const expectedLineCount = Number(order.datatotalnumber || 0) || null;
    let exportResp = null;
    let text = '';
    let filename = `${order.ordercode}.txt`;
    let lineCount = 0;
    let status = null;
    let attempts = 0;

    while (attempts < maxAttempts) {
      attempts += 1;
      exportResp = await apiFetch('/DataPortal/v1/data/order/export', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
        },
        body: new URLSearchParams({
          orderinfoid: String(order.orderinfoid),
          center: String(order.centerFlag || 1)
        })
      });

      status = exportResp.status;
      if (!exportResp.ok) break;

      text = await exportResp.text();
      filename = parseFilename(exportResp.headers.get('content-disposition'), `${order.ordercode}.txt`);
      lineCount = text ? text.split(/\r?\n/).filter(Boolean).length : 0;

      if (!expectedLineCount || lineCount === expectedLineCount) break;
      if (attempts < maxAttempts) await sleep(retryDelayMs);
    }

    if (!exportResp || !exportResp.ok) {
      downloaded.push({
        ordercode: order.ordercode,
        success: false,
        status
      });
      continue;
    }

    const complete = !expectedLineCount || lineCount === expectedLineCount;
    downloaded.push({
      ordercode: order.ordercode,
      success: complete,
      filename,
      lineCount,
      expectedLineCount,
      complete,
      attempts
    });

    if (!complete) continue;

    if (mode === 'download') {
      await downloadText(filename, text);
      await sleep(delayMs);
    }
    mergedParts.push(`# ${order.ordercode}\r\n${text.replace(/\s+$/,'')}\r\n`);
  }

  const mergedFilename = `${batch.batchId || 'batch'}-merged.txt`;
  if (mergedParts.length && mode === 'merged') {
    await downloadText(mergedFilename, mergedParts.join('\r\n'));
  }

  const totalFiles = batch.orders.reduce((sum, row) => sum + Number(row.datatotalnumber || 0), 0);
  const totalSizeBytes = batch.orders.reduce((sum, row) => sum + Number(row.dataquantity || 0), 0);

  return {
    selector,
    mode,
    batchNo: batch.batchNo,
    batchId: batch.batchId,
    ordertime: batch.ordertime,
    orderCount: batch.orders.length,
    totalFiles,
    totalSizeBytes,
    totalSizeHuman: formatBytes(totalSizeBytes),
    downloadMode: mode,
    downloadMethod: mode === 'download' ? 'browser-blob-anchor' : (mode === 'merged' ? 'browser-blob-anchor-merged' : 'preview-only'),
    delayMs: mode === 'download' ? delayMs : null,
    maxAttempts,
    retryDelayMs,
    downloadedCount: downloaded.filter((item) => item.success).length,
    mergedFilename: mergedParts.length && mode === 'merged' ? mergedFilename : null,
    downloads: downloaded
  };
}
