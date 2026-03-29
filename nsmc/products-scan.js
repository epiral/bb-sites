/* @meta
{
  "name": "nsmc/products-scan",
  "description": "扫描 NSMC DataPortal 指定卫星的产品；按 structure.html 的 datagroup 流程发现产品，包含 FY4B 的 L1 产品",
  "domain": "satellite.nsmc.org.cn",
  "args": {
    "satellite": {"required": false, "description": "卫星代码，默认 FY4B"},
    "level": {"required": false, "description": "可选级别筛选，如 L1、L2 或 L3"},
    "instrument": {"required": false, "description": "可选仪器筛选，如 AGRI 或 GIIRS"},
    "datatype": {"required": false, "description": "可选数据类型筛选，如 TBB 或 CTH"},
    "areatype": {"required": false, "description": "可选区域筛选，如 DISK"},
    "datagroup": {"required": false, "description": "可选 datagroup 筛选，如 L1 或 Product"},
    "view": {"required": false, "description": "summary（默认）或 detail"},
    "limit": {"required": false, "description": "detail 视图下的最大返回产品数，默认 200"}
  },
  "capabilities": ["network"],
  "readOnly": true,
  "example": "bb-browser site nsmc/products-scan FY4B L1 --json"
}
*/

async function(args) {
  const satellite = String(args.satellite || 'FY4B').trim();
  const isLevelToken = (value) => /^L\d$/i.test(String(value || '').trim());
  const isViewToken = (value) => /^(summary|detail)$/i.test(String(value || '').trim());
  const normalizeCode = (value) => String(value || '').trim().toUpperCase();
  const canonicalDatagroup = (value) => {
    const code = normalizeCode(value);
    if (!code) return null;
    return code === 'PRODUCT' ? 'Product' : code;
  };
  const compareCode = (left, right) => normalizeCode(left) === normalizeCode(right);

  const rawLevel = String(args.level || '').trim();
  const rawInstrument = String(args.instrument || '').trim();
  const rawDatatype = String(args.datatype || '').trim();
  const rawAreatype = String(args.areatype || '').trim();
  const rawDatagroup = String(args.datagroup || '').trim();
  const rawView = String(args.view || '').trim();
  const rawLimit = String(args.limit || '').trim();

  let levelToken = rawLevel;
  let instrumentToken = rawInstrument;
  let datatypeToken = rawDatatype;
  let areatypeToken = rawAreatype;
  let datagroupToken = rawDatagroup;
  let viewToken = rawView;
  let limitToken = rawLimit;

  // bb-browser site handles private adapter positionals more reliably than named flags.
  // If the second positional token is not a level, shift the rest left so
  // "FY4B AGRI TBB detail" still works.
  if (levelToken && !isLevelToken(levelToken)) {
    instrumentToken = levelToken;
    datatypeToken = rawInstrument;
    areatypeToken = rawDatatype;
    datagroupToken = rawAreatype;
    viewToken = rawView || rawDatagroup;
    limitToken = rawLimit;
    levelToken = '';
  }

  if (isViewToken(datagroupToken) && !viewToken) {
    viewToken = datagroupToken;
    datagroupToken = '';
  }
  if (isViewToken(areatypeToken) && !viewToken) {
    viewToken = areatypeToken;
    areatypeToken = '';
  }
  if (isViewToken(datatypeToken) && !viewToken && !areatypeToken) {
    viewToken = datatypeToken;
    datatypeToken = '';
  }
  if (isViewToken(instrumentToken) && !viewToken && !datatypeToken && !areatypeToken && !datagroupToken) {
    viewToken = instrumentToken;
    instrumentToken = '';
  }

  let levelFilter = normalizeCode(levelToken || '');
  let instrumentFilter = normalizeCode(instrumentToken || '');
  let datatypeFilter = normalizeCode(datatypeToken || '');
  let areatypeFilter = normalizeCode(areatypeToken || '');
  let datagroupFilter = canonicalDatagroup(datagroupToken || '');
  let view = String(viewToken || 'summary').trim().toLowerCase() === 'detail' ? 'detail' : 'summary';
  const limit = Math.max(1, Number(limitToken || 200) || 200);
  let cachedTokenPromise = null;

  function normalizeParsedFilters() {
    if (isViewToken(datagroupFilter) && view === 'summary') {
      view = 'detail';
      datagroupFilter = '';
    }
    if (isViewToken(areatypeFilter) && view === 'summary') {
      view = 'detail';
      areatypeFilter = '';
    }
    if (isViewToken(datatypeFilter) && view === 'summary' && !areatypeFilter) {
      view = 'detail';
      datatypeFilter = '';
    }
    if (isViewToken(instrumentFilter) && view === 'summary' && !datatypeFilter && !areatypeFilter) {
      view = 'detail';
      instrumentFilter = '';
    }
    datagroupFilter = canonicalDatagroup(datagroupFilter || '') || '';
  }

  normalizeParsedFilters();

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

  async function fetchJson(url, optional = false) {
    const resp = await apiFetch(url);
    if (!resp.ok) {
      if (optional) return null;
      throw new Error((url.includes('/instrument') ? 'Metadata' : 'Product') + ' HTTP ' + resp.status);
    }
    const data = await resp.json().catch(() => null);
    if (!data) {
      if (optional) return null;
      throw new Error('Invalid JSON response');
    }
    if (data.status !== 1) {
      if (optional) return null;
      throw new Error(data.message || ('API status ' + data.status));
    }
    return Array.isArray(data.resource) ? data.resource : [];
  }

  const normalizeLevel = (product, datagroup) => {
    const explicit = normalizeCode(product.datalevel || '');
    if (explicit) return explicit;
    const filenamecode = String(product.filenamecode || '');
    const match = filenamecode.match(/_L(\d)-/i);
    if (match) return `L${match[1]}`;
    const groupCode = normalizeCode(datagroup || '');
    return /^L\d$/i.test(groupCode) ? groupCode : null;
  };

  const compactProduct = (instrument, datagroup, datatype, areatype, product, discoveryPath) => ({
    satellite,
    instrument,
    datagroup,
    datatype,
    areatype: normalizeCode(areatype || product.areatypecode || product.AREATYPECODE || '') || null,
    datalevel: normalizeLevel(product, datagroup),
    discoveryPath,
    filenamecode: product.filenamecode || null,
    productalias: product.productalias || null,
    productionname: product.productionname || null,
    productionnameeng: product.productionnameeng || null,
    formatcode: product.formatcode || null,
    resolution: product.resolution || null,
    channelname: product.channelname || null,
    projection: product.projection || null,
    databegindate: product.databegindate || null,
    dataenddate: product.dataenddate || null,
    datafilenum: product.datafilenum != null ? Number(product.datafilenum) : null,
    datafilesize: product.datafilesize != null ? Number(product.datafilesize) : null
  });

  try {
    const instrumentRows = await fetchJson('/DataPortal/v1/data/type/satellite/' + encodeURIComponent(satellite) + '/instrument');
    const allInstruments = instrumentRows
      .map((row) => normalizeCode(row.instrumenttypecode || row.INSTRUMENTTYPECODE || ''))
      .filter(Boolean);

    // Positionals are ambiguous: "FY4B CTP" should mean datatype CTP, not instrument CTP.
    // If the parsed instrument token is not a real instrument code, shift the filters left.
    if (instrumentFilter && !allInstruments.includes(instrumentFilter)) {
      if (compareCode(instrumentFilter, 'PRODUCT')) {
        datagroupFilter = 'Product';
        instrumentFilter = '';
      } else {
        const shiftedInstrument = instrumentFilter;
        const shiftedDatatype = datatypeFilter;
        const shiftedAreatype = areatypeFilter;
        const shiftedDatagroup = datagroupFilter;

        instrumentFilter = '';
        datatypeFilter = shiftedInstrument;
        areatypeFilter = shiftedDatatype;
        datagroupFilter = shiftedAreatype;

        if (isViewToken(shiftedDatagroup) && view === 'summary') {
          view = 'detail';
        }
      }
      normalizeParsedFilters();
    }

    const instruments = allInstruments
      .filter((code) => !instrumentFilter || code === instrumentFilter);

    if (!instruments.length) {
      return {
        error: 'No instruments found',
        satellite,
        instrument: instrumentFilter || null
      };
    }

    const products = [];
    const seen = new Set();
    const scanned = {
      instruments: instruments.length,
      datagroups: 0,
      datatypes: 0,
      areatypes: 0,
      directProductDatatypes: 0
    };

    for (const instrument of instruments) {
      let datagroups = await fetchJson(
        '/DataPortal/v1/data/type/satellite/' + encodeURIComponent(satellite) + '/instrument/' + encodeURIComponent(instrument) + '/datagroup',
        true
      );
      datagroups = (datagroups || [])
        .map((row) => canonicalDatagroup(row.datatypegroupcode || row.DATATYPEGROUPCODE || ''))
        .filter(Boolean);

      if (!datagroups.length) {
        datagroups = ['Product'];
      }

      datagroups = datagroups.filter((code) => !datagroupFilter || compareCode(code, datagroupFilter));
      scanned.datagroups += datagroups.length;

      for (const datagroup of datagroups) {
        let datatypeRows = await fetchJson(
          '/DataPortal/v1/data/type/satellite/' + encodeURIComponent(satellite) + '/instrument/' + encodeURIComponent(instrument) + '/datagroup/' + encodeURIComponent(datagroup) + '/datatype',
          true
        );
        datatypeRows = datatypeRows || [];

        const datatypes = datatypeRows
          .map((row) => normalizeCode(row.datatypecode || row.DATATYPECODE || ''))
          .filter(Boolean)
          .filter((code) => !datatypeFilter || code === datatypeFilter);

        scanned.datatypes += datatypes.length;

        for (const datatype of datatypes) {
          let areatypeRows = await fetchJson(
            '/DataPortal/v1/data/type/satellite/' + encodeURIComponent(satellite) + '/instrument/' + encodeURIComponent(instrument) + '/datatype/' + encodeURIComponent(datatype) + '/areatype',
            true
          );
          areatypeRows = areatypeRows || [];

          const areatypes = areatypeRows
            .map((row) => normalizeCode(row.AREATYPECODE || row.areatypecode || ''))
            .filter(Boolean)
            .filter((code) => !areatypeFilter || code === areatypeFilter);

          if (areatypes.length) {
            scanned.areatypes += areatypes.length;

            for (const areatype of areatypes) {
              const productRows = await fetchJson(
                '/DataPortal/v1/data/type/satellite/' + encodeURIComponent(satellite) + '/instrument/' + encodeURIComponent(instrument) + '/datatype/' + encodeURIComponent(datatype) + '/areatype/' + encodeURIComponent(areatype) + '/product',
                true
              ) || [];

              for (const row of productRows) {
                const product = compactProduct(instrument, datagroup, datatype, areatype, row, 'datagroup-areatype-product');
                if (levelFilter && product.datalevel !== levelFilter) continue;
                const key = [product.instrument, product.datagroup, product.datatype, product.areatype || '', product.filenamecode || ''].join('|');
                if (seen.has(key)) continue;
                seen.add(key);
                products.push(product);
              }
            }
            continue;
          }

          if (areatypeFilter) continue;

          scanned.directProductDatatypes += 1;
          const productRows = await fetchJson(
            '/DataPortal/v1/data/type/satellite/' + encodeURIComponent(satellite) + '/instrument/' + encodeURIComponent(instrument) + '/datatype/' + encodeURIComponent(datatype) + '/product',
            true
          ) || [];

          for (const row of productRows) {
            const product = compactProduct(instrument, datagroup, datatype, null, row, 'datagroup-product');
            if (levelFilter && product.datalevel !== levelFilter) continue;
            const key = [product.instrument, product.datagroup, product.datatype, '', product.filenamecode || ''].join('|');
            if (seen.has(key)) continue;
            seen.add(key);
            products.push(product);
          }
        }
      }
    }

    products.sort((left, right) => {
      const leftKey = [
        left.instrument || '',
        left.datagroup || '',
        left.datalevel || '',
        left.datatype || '',
        left.areatype || '',
        left.resolution || '',
        left.filenamecode || ''
      ].join('|');
      const rightKey = [
        right.instrument || '',
        right.datagroup || '',
        right.datalevel || '',
        right.datatype || '',
        right.areatype || '',
        right.resolution || '',
        right.filenamecode || ''
      ].join('|');
      return leftKey.localeCompare(rightKey);
    });

    const levelCounts = {};
    const byDatagroup = {};
    const byInstrument = {};
    const byDatatype = {};

    for (const product of products) {
      const level = product.datalevel || 'UNKNOWN';
      levelCounts[level] = (levelCounts[level] || 0) + 1;

      if (!byDatagroup[product.datagroup]) {
        byDatagroup[product.datagroup] = {
          datagroup: product.datagroup,
          productCount: 0,
          instruments: new Set(),
          datatypes: new Set(),
          levels: new Set()
        };
      }
      byDatagroup[product.datagroup].productCount += 1;
      byDatagroup[product.datagroup].instruments.add(product.instrument);
      byDatagroup[product.datagroup].datatypes.add(product.datatype);
      byDatagroup[product.datagroup].levels.add(level);

      if (!byInstrument[product.instrument]) {
        byInstrument[product.instrument] = {
          instrument: product.instrument,
          productCount: 0,
          datagroups: new Set(),
          datatypes: new Set(),
          levels: new Set()
        };
      }
      byInstrument[product.instrument].productCount += 1;
      byInstrument[product.instrument].datagroups.add(product.datagroup);
      byInstrument[product.instrument].datatypes.add(product.datatype);
      byInstrument[product.instrument].levels.add(level);

      const datatypeKey = [product.instrument, product.datagroup, product.datatype].join(':');
      if (!byDatatype[datatypeKey]) {
        byDatatype[datatypeKey] = {
          instrument: product.instrument,
          datagroup: product.datagroup,
          datatype: product.datatype,
          productCount: 0,
          areatypes: new Set(),
          levels: new Set()
        };
      }
      byDatatype[datatypeKey].productCount += 1;
      if (product.areatype) byDatatype[datatypeKey].areatypes.add(product.areatype);
      byDatatype[datatypeKey].levels.add(level);
    }

    const summary = {
      satellite,
      filters: {
        instrument: instrumentFilter || null,
        datagroup: datagroupFilter || null,
        datatype: datatypeFilter || null,
        areatype: areatypeFilter || null,
        level: levelFilter || null
      },
      discovery: {
        strategy: 'datagroup-first',
        note: 'Matches structure.html discovery flow so FY4B L1 products are included'
      },
      scanned,
      matchedCount: products.length,
      levelCounts: Object.fromEntries(Object.entries(levelCounts).sort(([a], [b]) => a.localeCompare(b))),
      datagroups: Object.values(byDatagroup)
        .map((item) => ({
          datagroup: item.datagroup,
          productCount: item.productCount,
          instrumentCount: item.instruments.size,
          datatypeCount: item.datatypes.size,
          levels: Array.from(item.levels).sort()
        }))
        .sort((a, b) => String(a.datagroup).localeCompare(String(b.datagroup))),
      instruments: Object.values(byInstrument)
        .map((item) => ({
          instrument: item.instrument,
          productCount: item.productCount,
          datagroupCount: item.datagroups.size,
          datatypeCount: item.datatypes.size,
          levels: Array.from(item.levels).sort()
        }))
        .sort((a, b) => a.instrument.localeCompare(b.instrument)),
      datatypes: Object.values(byDatatype)
        .map((item) => ({
          instrument: item.instrument,
          datagroup: item.datagroup,
          datatype: item.datatype,
          productCount: item.productCount,
          areatypeCount: item.areatypes.size,
          levels: Array.from(item.levels).sort()
        }))
        .sort((a, b) => (a.instrument + a.datagroup + a.datatype).localeCompare(b.instrument + b.datagroup + b.datatype))
    };

    if (view !== 'detail') {
      return summary;
    }

    return {
      ...summary,
      limit,
      truncated: products.length > limit,
      products: products.slice(0, limit)
    };
  } catch (error) {
    return {
      error: error.message || String(error),
      satellite,
      filters: {
        instrument: instrumentFilter || null,
        datagroup: datagroupFilter || null,
        datatype: datatypeFilter || null,
        areatype: areatypeFilter || null,
        level: levelFilter || null
      }
    };
  }
}
