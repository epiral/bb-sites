/* @meta
{
  "name": "nsmc/order-status",
  "description": "获取指定订单号的 NSMC DataPortal 订单摘要和进度轨迹",
  "domain": "satellite.nsmc.org.cn",
  "args": {
    "ordercode": {"required": true, "description": "订单号，例如 A202603290318022067"},
    "scope": {"required": false, "description": "auto、current 或 history；默认 auto"}
  },
  "capabilities": ["network"],
  "readOnly": true,
  "example": "bb-browser site nsmc/order-status A202603290318022067"
}
*/

async function(args) {
  const ordercode = (args.ordercode || '').trim();
  const scope = (args.scope || 'auto').trim().toLowerCase();
  if (!ordercode) return {error: 'Missing argument: ordercode'};
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

  const historyStatusLabel = (code) => ({
    '7': '已删除',
    '11': '已取消'
  })[String(code)] || '已过期';

  const traceStatusLabel = (code) => ({
    '0': '已提交',
    '1': '准备中',
    '2': '数据准备中',
    '3': '回调完成',
    '4': '订单完成',
    '5': '订单完成'
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

  const parseOrderDay = (code) => {
    const m = /^A(\d{4})(\d{2})(\d{2})/.exec(code);
    if (!m) return null;
    return `${m[1]}-${m[2]}-${m[3]}`;
  };

  async function fetchJson(url) {
    const resp = await apiFetch(url);
    const text = await resp.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch (error) {
    }
    return {ok: resp.ok, status: resp.status, text, json};
  }

  function mapSummary(row, foundScope) {
    if (!row) return null;
    const label = foundScope === 'history' ? historyStatusLabel(row.orderstatus) : currentStatusLabel(row.orderstatus);
    return {
      orderinfoid: row.orderinfoid || null,
      ordercode: row.ordercode || ordercode,
      ordertime: row.ordertime || null,
      finishtime: row.finishtime || null,
      orderstatus: row.orderstatus != null ? String(row.orderstatus) : null,
      orderstatusLabel: label,
      datatotalnumber: row.datatotalnumber != null ? Number(row.datatotalnumber) : null,
      dataquantityBytes: row.dataquantity != null ? Number(row.dataquantity) : null,
      dataquantityHuman: row.dataquantity != null ? formatBytes(row.dataquantity) : null,
      fillordercount: row.fillordercount != null ? Number(row.fillordercount) : null,
      serviceCode: row.serviceCode || null,
      centerFlag: row.centerFlag != null ? row.centerFlag : null,
      cloudFlag: row.cloudFlag != null ? row.cloudFlag : null,
      shippingtype: row.shippingtype || null,
      noticetype: row.noticetype || null
    };
  }

  try {
    let foundScope = null;
    let summaryRow = null;
    let historyQuery = null;

    if (scope !== 'history') {
      const current = await fetchJson('/DataPortal/v1/data/order/suborder');
      if (current.ok && current.json?.status === 1 && Array.isArray(current.json.resource)) {
        summaryRow = current.json.resource.find((row) => row.ordercode === ordercode) || null;
        if (summaryRow) foundScope = 'current';
      }
    }

    if (!summaryRow && scope !== 'current') {
      const orderDay = parseOrderDay(ordercode);
      if (orderDay) {
        historyQuery = {
          beginTime: `${orderDay} 00:00:00`,
          endTime: `${orderDay} 23:59:59`
        };
        const params = new URLSearchParams(historyQuery);
        const history = await fetchJson('/DataPortal/v1/data/order/subhistory?' + params.toString());
        if (history.ok && history.json?.status === 1 && Array.isArray(history.json.resource)) {
          summaryRow = history.json.resource.find((row) => row.ordercode === ordercode) || null;
          if (summaryRow) foundScope = 'history';
        }
      }
    }

    const [traceResp, sumResp] = await Promise.all([
      fetchJson('/DataPortal/v1/data/order/' + encodeURIComponent(ordercode) + '/status?suborderid='),
      fetchJson('/DataPortal/v1/data/order/' + encodeURIComponent(ordercode) + '/sum?suborderid=')
    ]);

    const traceRows = traceResp.ok && traceResp.json?.status === 1 && Array.isArray(traceResp.json.resource)
      ? traceResp.json.resource
      : [];

    const trace = traceRows.map((row) => ({
      orderstatusid: row.orderstatusid || null,
      fillordercode: row.fillordercode || null,
      orderdisplaystatus: row.orderdisplaystatus != null ? String(row.orderdisplaystatus) : null,
      orderdisplaystatusLabel: traceStatusLabel(row.orderdisplaystatus),
      statustime: row.statustime || null,
      created: row.created || null,
      updated: row.updated || null,
      createdby: row.createdby || null
    }));

    const latestTrace = trace.length ? trace[trace.length - 1] : null;
    const sum = sumResp.ok && sumResp.json?.status === 1 && sumResp.json.resource
      ? {
          fileCount: sumResp.json.resource.FILENUM != null ? Number(sumResp.json.resource.FILENUM) : null,
          dataSizeBytes: sumResp.json.resource.DATASIZE != null ? Number(sumResp.json.resource.DATASIZE) : null,
          dataSizeHuman: sumResp.json.resource.DATASIZE != null ? formatBytes(sumResp.json.resource.DATASIZE) : null
        }
      : null;

    const summary = mapSummary(summaryRow, foundScope);
    if (!summary && !trace.length && !sum) {
      return {
        error: 'Order not found',
        ordercode,
        scope,
        historyQuery
      };
    }

    return {
      ordercode,
      scopeRequested: scope,
      scopeResolved: foundScope || null,
      summary,
      sum,
      traceCount: trace.length,
      latestTrace,
      trace,
      historyQuery
    };
  } catch (error) {
    return {error: error.message || String(error), ordercode, scope};
  }
}
