/* @meta
{
  "name": "nsmc/cart-add",
  "description": "将指定 NSMC DataPortal 产品和日期范围批量加入购物车；默认仅预览，传入 --confirm yes 才会真正加入",
  "domain": "satellite.nsmc.org.cn",
  "args": {
    "beginDate": {"required": true, "description": "开始日期，格式 YYYY-MM-DD"},
    "endDate": {"required": true, "description": "结束日期，格式 YYYY-MM-DD"},
    "datatype": {"required": false, "description": "未提供 product 时使用的数据类型，如 CTH 或 CTP"},
    "timeSelection": {"required": false, "description": "时间筛选，如 00、15、30、45、all；默认 00"},
    "confirm": {"required": false, "description": "传 yes 才会真正加入购物车；否则只返回预览结果"},
    "product": {"required": false, "description": "精确的 filenamecode；传入后会覆盖 datatype 查找"},
    "satellite": {"required": false, "description": "卫星代码，默认 FY4B"},
    "instrument": {"required": false, "description": "仪器代码，默认 AGRI"},
    "areatype": {"required": false, "description": "区域类型，默认 DISK"},
    "beginTime": {"required": false, "description": "开始时间，默认 00:00:00"},
    "endTime": {"required": false, "description": "结束时间，默认 23:59:59"},
    "beginIndex": {"required": false, "description": "分页起始索引，默认 1"},
    "endIndex": {"required": false, "description": "分页结束索引，默认 10"}
  },
  "capabilities": ["network"],
  "readOnly": false,
  "example": "bb-browser site nsmc/cart-add 2023-11-05 2023-12-31 --datatype CTH --timeSelection 00 --confirm yes"
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
  const beginIndex = Math.max(1, parseInt(args.beginIndex || '1', 10) || 1);
  const endIndex = Math.max(beginIndex, parseInt(args.endIndex || '10', 10) || 10);
  const confirm = /^(1|true|yes|y|on)$/i.test(String(args.confirm || ''));
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
  const diffDays = (a, b) => {
    const start = new Date(a + 'T00:00:00Z');
    const end = new Date(b + 'T00:00:00Z');
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
    return Math.floor((end - start) / 86400000) + 1;
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
      throw new Error(data.message || 'No product found');
    }
    return data.resource[0].filenamecode;
  }
  function buildBasePayload(productID) {
    return {
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
      beginIndex,
      endIndex,
      where: '',
      timeSelection,
      periodTime: '',
      daynight: ''
    };
  }
  function toSearchParams(payload, includeFileMeta) {
    const params = new URLSearchParams();
    Object.entries(payload).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      if (!includeFileMeta && (key === 'filecount' || key === 'filesize' || key === 'source')) return;
      params.set(key, String(value));
    });
    return params;
  }
  function pluckFileNames(rows) {
    return (Array.isArray(rows) ? rows : []).map((row) => (
      row?.ARCHIVENAME || row?.archiveName || row?.FILENAME || row?.filename || row?.fileName || row?.name || row?.FILE_NAME || null
    )).filter(Boolean);
  }

  if (!beginDate) return {error: 'Missing argument: beginDate'};
  if (!endDate) return {error: 'Missing argument: endDate'};

  try {
    const spanDays = diffDays(beginDate, endDate);
    if (spanDays && spanDays > 92) {
      return {
        error: 'Requested range is larger than 92 days',
        hint: 'Split the range into chunks no larger than about 92 days before cart add',
        spanDays
      };
    }

    const productID = await resolveProduct();
    const basePayload = buildBasePayload(productID);
    const countParams = toSearchParams(basePayload, false);
    const countResp = await apiFetch('/DataPortal/v1/data/selection/file/subcount?' + countParams.toString());
    if (!countResp.ok) {
      return {
        error: 'HTTP ' + countResp.status,
        hint: countResp.status === 401 || countResp.status === 403 ? 'Please log in to the NSMC DataPortal first' : 'Search count failed'
      };
    }
    const countData = await countResp.json();
    if (countData.status !== 1) return {error: countData.message || ('API status ' + countData.status), status: countData.status, productID};

    const filecount = Number(countData.resource?.FILECOUNT || 0);
    const filesize = Number(countData.resource?.FILESIZE || 0);
    const payload = {
      ...basePayload,
      filecount,
      filesize,
      source: 0
    };
    const searchParams = toSearchParams(payload, true);

    const recordResp = await apiFetch('/DataPortal/v1/data/selection/subfilesearchrecord?' + searchParams.toString());
    if (!recordResp.ok) return {error: 'Search record HTTP ' + recordResp.status, productID, filecount, filesize_bytes: filesize};
    const recordData = await recordResp.json();
    if (recordData.status !== 1) return {error: recordData.message || ('API status ' + recordData.status), status: recordData.status, productID, filecount, filesize_bytes: filesize};

    const fileResp = await apiFetch('/DataPortal/v1/data/selection/subfile?' + searchParams.toString());
    if (!fileResp.ok) return {error: 'File list HTTP ' + fileResp.status, productID, filecount, filesize_bytes: filesize};
    const fileData = await fileResp.json();
    if (fileData.status !== 1) return {error: fileData.message || ('API status ' + fileData.status), status: fileData.status, productID, filecount, filesize_bytes: filesize};

    const records = Array.isArray(recordData.resource) ? recordData.resource : [];
    const pageFileNames = pluckFileNames(fileData.resource);
    const preview = {
      preview: !confirm,
      productID,
      beginDate,
      endDate,
      beginTime,
      endTime,
      timeSelection,
      filecount,
      filesize_bytes: filesize,
      filesize_human: formatBytes(filesize),
      records,
      pageFileNamesSample: pageFileNames.slice(0, 5),
      pageFileNameCount: pageFileNames.length
    };

    if (!confirm) {
      return {
        ...preview,
        hint: 'Re-run with --confirm yes to add this range to the cart'
      };
    }

    const addPayload = {
      ...payload,
      intoFlag: true,
      subFileSearchReaords: JSON.stringify(records),
      pageFileNames
    };
    const addResp = await apiFetch('/DataPortal/v1/data/cart/suboption', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(addPayload)
    });
    if (!addResp.ok) return {error: 'cart/suboption HTTP ' + addResp.status, ...preview};
    const addData = await addResp.json().catch(() => null);
    if (!addData) return {error: 'Invalid JSON response from cart/suboption', ...preview};
    if (addData.status !== 1) {
      return {
        error: addData.message || ('API status ' + addData.status),
        status: addData.status,
        ...preview
      };
    }

    const statsResp = await apiFetch('/DataPortal/v1/data/cart/substats').catch(() => null);
    const statsData = statsResp ? await statsResp.json().catch(() => null) : null;

    return {
      ...preview,
      preview: false,
      added: true,
      response: addData,
      cartStats: statsData?.status === 1 ? statsData.resource : null
    };
  } catch (error) {
    return {error: error.message || String(error)};
  }
}
