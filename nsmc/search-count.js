/* @meta
{
  "name": "nsmc/search-count",
  "description": "统计指定产品和日期范围内匹配的文件数量及总大小",
  "domain": "satellite.nsmc.org.cn",
  "args": {
    "beginDate": {"required": true, "description": "开始日期，格式 YYYY-MM-DD"},
    "endDate": {"required": true, "description": "结束日期，格式 YYYY-MM-DD"},
    "datatype": {"required": false, "description": "未提供 product 时使用的数据类型，如 CTH 或 CTP"},
    "timeSelection": {"required": false, "description": "时间筛选，如 00、15、30、45、all；默认 00"},
    "product": {"required": false, "description": "精确的 filenamecode；传入后会覆盖 datatype 查找"},
    "satellite": {"required": false, "description": "卫星代码，默认 FY4B"},
    "instrument": {"required": false, "description": "仪器代码，默认 AGRI"},
    "areatype": {"required": false, "description": "区域类型，默认 DISK"},
    "beginTime": {"required": false, "description": "开始时间，默认 00:00:00"},
    "endTime": {"required": false, "description": "结束时间，默认 23:59:59"}
  },
  "capabilities": ["network"],
  "readOnly": true,
  "example": "bb-browser site nsmc/search-count 2023-11-05 2023-12-31 --datatype CTH --timeSelection 00"
}
*/

async function(args) {
  const satellite = (args.satellite || 'FY4B').trim();
  const instrument = (args.instrument || 'AGRI').trim();
  const areatype = (args.areatype || 'DISK').trim();
  const beginDate = (args.beginDate || '').trim();
  const endDate = (args.endDate || '').trim();
  const beginTime = (args.beginTime || '00:00:00').trim();
  const endTime = (args.endTime || '23:59:59').trim();
  const timeSelection = (args.timeSelection || '00').trim();
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
  const diffDays = (a, b) => {
    const start = new Date(a + 'T00:00:00Z');
    const end = new Date(b + 'T00:00:00Z');
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
    return Math.floor((end - start) / 86400000) + 1;
  };
  async function resolveProduct() {
    const product = (args.product || '').trim();
    const datatypeFromArg = (args.datatype || '').trim();
    const looksLikeFilenameCode = product.includes('_') || /\.nc$/i.test(product) || /YYYYMMDD/i.test(product);
    if (product && looksLikeFilenameCode) return product;
    const datatype = datatypeFromArg || (/^[A-Z0-9]{2,8}$/i.test(product) ? product : '');
    if (!datatype) throw new Error('Missing argument: product or datatype');
    const endpoint = `/DataPortal/v1/data/type/satellite/${encodeURIComponent(satellite)}/instrument/${encodeURIComponent(instrument)}/datatype/${encodeURIComponent(datatype)}/areatype/${encodeURIComponent(areatype)}/product`;
    const resp = await apiFetch(endpoint);
    if (!resp.ok) throw new Error('Product lookup HTTP ' + resp.status);
    const data = await resp.json();
    if (data.status !== 1 || !Array.isArray(data.resource) || !data.resource.length) {
      throw new Error(data.message || 'No product found for datatype ' + datatype);
    }
    return data.resource[0].filenamecode;
  }
  function buildParams(productID) {
    return new URLSearchParams({
      productID,
      txtBeginDate: beginDate,
      txtBeginTime: beginTime,
      txtEndDate: endDate,
      txtEndTime: endTime,
      east_CoordValue: '180.0',
      west_CoordValue: '-180.0',
      north_CoordValue: '90.0',
      south_CoordValue: '-90.0',
      cbAllArea: 'on',
      cbGHIArea: 'on',
      converStatus: '',
      rdbIsEvery: '',
      beginIndex: '1',
      endIndex: '10',
      where: '',
      timeSelection,
      periodTime: '',
      daynight: ''
    });
  }

  if (!beginDate) return {error: 'Missing argument: beginDate'};
  if (!endDate) return {error: 'Missing argument: endDate'};

  try {
    const productID = await resolveProduct();
    const params = buildParams(productID);
    const resp = await apiFetch('/DataPortal/v1/data/selection/file/subcount?' + params.toString());
    if (!resp.ok) {
      return {
        error: 'HTTP ' + resp.status,
        hint: resp.status === 401 || resp.status === 403 ? 'Please log in to the NSMC DataPortal first' : 'Search count failed'
      };
    }
    const data = await resp.json().catch(() => null);
    if (!data) return {error: 'Invalid JSON response'};
    if (data.status !== 1) {
      return {
        error: data.message || ('API status ' + data.status),
        status: data.status,
        productID
      };
    }
    const resource = data.resource || {};
    const filecount = Number(resource.FILECOUNT || 0);
    const filesize = Number(resource.FILESIZE || 0);
    const spanDays = diffDays(beginDate, endDate);
    return {
      productID,
      beginDate,
      endDate,
      beginTime,
      endTime,
      timeSelection,
      spanDays,
      warning: spanDays && spanDays > 92 ? 'subcount may succeed, but subfile/cart add usually needs chunks no larger than 92 days' : null,
      filecount,
      filesize_bytes: filesize,
      filesize_human: formatBytes(filesize),
      query: Object.fromEntries(params.entries())
    };
  } catch (error) {
    return {error: error.message || String(error)};
  }
}
