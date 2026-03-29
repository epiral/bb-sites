/* @meta
{
  "name": "nsmc/product-code",
  "description": "按卫星、仪器、数据类型和区域解析 NSMC DataPortal 产品的 filenamecode",
  "domain": "satellite.nsmc.org.cn",
  "args": {
    "datatype": {"required": true, "description": "数据类型，如 CTH、CTP、CTT"},
    "satellite": {"required": false, "description": "卫星代码，默认 FY4B"},
    "instrument": {"required": false, "description": "仪器代码，默认 AGRI"},
    "areatype": {"required": false, "description": "区域类型，默认 DISK"},
    "pick": {"required": false, "description": "要选取的产品下标，从 0 开始；默认 0"}
  },
  "capabilities": ["network"],
  "readOnly": true,
  "example": "bb-browser site nsmc/product-code CTP --satellite FY4B --instrument AGRI --areatype DISK"
}
*/

async function(args) {
  const satellite = (args.satellite || 'FY4B').trim();
  const instrument = (args.instrument || 'AGRI').trim();
  const datatype = (args.datatype || '').trim();
  const areatype = (args.areatype || 'DISK').trim();
  const pick = Math.max(0, parseInt(args.pick || '0', 10) || 0);

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

  if (!datatype) return {error: 'Missing argument: datatype'};

  const endpoint = `/DataPortal/v1/data/type/satellite/${encodeURIComponent(satellite)}/instrument/${encodeURIComponent(instrument)}/datatype/${encodeURIComponent(datatype)}/areatype/${encodeURIComponent(areatype)}/product`;
  const resp = await apiFetch(endpoint);
  if (!resp.ok) {
    return {
      error: 'HTTP ' + resp.status,
      hint: resp.status === 401 || resp.status === 403 ? 'Please log in to the NSMC DataPortal first' : 'Product lookup failed'
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

  const products = Array.isArray(data.resource) ? data.resource : [];
  if (!products.length) {
    return {
      error: 'No products found',
      satellite,
      instrument,
      datatype,
      areatype
    };
  }

  const selected = products[Math.min(pick, products.length - 1)];
  return {
    satellite,
    instrument,
    datatype,
    areatype,
    count: products.length,
    pick: Math.min(pick, products.length - 1),
    selected: {
      filenamecode: selected.filenamecode,
      productalias: selected.productalias || null,
      productionname: selected.productionname || null,
      productionnameeng: selected.productionnameeng || null,
      datalevel: selected.datalevel || null,
      resolution: selected.resolution || null,
      channelname: selected.channelname || null,
      projection: selected.projection || null,
      databegindate: selected.databegindate || null,
      dataenddate: selected.dataenddate || null
    },
    products: products.map((p) => ({
      filenamecode: p.filenamecode,
      productalias: p.productalias || null,
      productionname: p.productionname || null,
      datalevel: p.datalevel || null,
      resolution: p.resolution || null,
      databegindate: p.databegindate || null,
      dataenddate: p.dataenddate || null
    }))
  };
}
