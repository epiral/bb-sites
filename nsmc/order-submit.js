/* @meta
{
  "name": "nsmc/order-submit",
  "description": "提交当前 NSMC DataPortal 购物车；默认先预览配额风险和回退建议，传入 --confirm yes 才会真正提交",
  "domain": "satellite.nsmc.org.cn",
  "args": {
    "confirm": {"required": false, "description": "传 yes 才会真正提交购物车"},
    "sendMail": {"required": false, "description": "yes 或 no，默认 yes"},
    "ftpMode": {"required": false, "description": "radioBtnlist_ftp 的取值，默认 0"},
    "zipFileStatus": {"required": false, "description": "zipfilestatus 的取值，默认 -1"},
    "cloudStatus": {"required": false, "description": "cloudStatus 的取值，默认 2"},
    "ordSource": {"required": false, "description": "订单来源，默认 NewPortalCH"},
    "beginDate": {"required": false, "description": "用于回退规划的原始开始日期，格式 YYYY-MM-DD"},
    "endDate": {"required": false, "description": "用于回退规划的原始结束日期，格式 YYYY-MM-DD"},
    "shrinkDirection": {"required": false, "description": "earliest（默认）固定 beginDate；latest 固定 endDate"}
  },
  "capabilities": ["network"],
  "readOnly": false,
  "example": "bb-browser site nsmc/order-submit --sendMail yes --confirm yes"
}
*/

async function(args) {
  const confirm = /^(1|true|yes|y|on)$/i.test(String(args.confirm || ''));
  const sendMail = !/^(0|false|no|n|off)$/i.test(String(args.sendMail || 'yes'));
  const ftpMode = String(args.ftpMode || '0');
  const zipFileStatus = String(args.zipFileStatus || '-1');
  const cloudStatus = String(args.cloudStatus || '2');
  const ordSource = String(args.ordSource || 'NewPortalCH');
  const beginDate = String(args.beginDate || '').trim();
  const endDate = String(args.endDate || '').trim();
  const shrinkDirection = /^(latest|end|backward)$/i.test(String(args.shrinkDirection || '')) ? 'latest' : 'earliest';
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

  const parseYmd = (value) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || '').trim());
    if (!m) return null;
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    if (Number.isNaN(d.getTime())) return null;
    return d;
  };

  const formatYmd = (date) => {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const addDays = (date, delta) => {
    const next = new Date(date.getTime());
    next.setUTCDate(next.getUTCDate() + delta);
    return next;
  };

  const diffDaysInclusive = (a, b) => {
    const start = parseYmd(a);
    const end = parseYmd(b);
    if (!start || !end) return null;
    return Math.floor((end - start) / 86400000) + 1;
  };

  const statusMeta = (status) => ({
    '-1': {
      code: -1,
      kind: 'daily-order-limit',
      label: '当日订单数已达上限',
      action: 'wait-and-retry',
      canAutoShrink: false,
      hint: 'This usually resets on the next quota window; shrinking the current cart does not normally help.'
    },
    '-2': {
      code: -2,
      kind: 'not-logged-in',
      label: '未登录',
      action: 'restore-session',
      canAutoShrink: false,
      hint: 'Restore the logged-in browser session before retrying.'
    },
    '-3': {
      code: -3,
      kind: 'in-progress-order-limit',
      label: '进行中订单数已达上限',
      action: 'wait-for-current-orders',
      canAutoShrink: false,
      hint: 'Wait until some current orders finish or expire, then retry submission.'
    },
    '-4': {
      code: -4,
      kind: 'daily-download-volume-limit',
      label: '当日下载体量已达上限',
      action: 'shrink-and-retry',
      canAutoShrink: true,
      hint: 'Keep the product and cadence fixed, then shrink to the largest continuous range that fits.'
    }
  })[String(status)] || null;

  const buildQuotaSummary = (stats, size) => {
    const cartFileCount = Number(stats?.subFileCount || stats?.fileCount || stats?.shopcount || 0);
    const cartSizeBytes = Number(size?.sizeOfShop || stats?.subFileSize || stats?.sizeOfShop || 0);
    const orderedSizeBytes = Number(size?.sizeOfOrd || 0);
    const totalOrdAndShopBytes = Number(size?.sizeOfOrdAndShop || 0);
    const remainDmzFileSizeBytes = stats?.remainDmzFileSize != null ? Number(stats.remainDmzFileSize) : null;
    const maxFileDownloadCount = size?.maxfiledownloadcount != null ? Number(size.maxfiledownloadcount) : null;
    const fitsDailyVolumeLimit = remainDmzFileSizeBytes != null ? cartSizeBytes <= remainDmzFileSizeBytes : null;
    const overflowBytes = remainDmzFileSizeBytes != null ? Math.max(0, cartSizeBytes - remainDmzFileSizeBytes) : null;
    const retainRatio = remainDmzFileSizeBytes != null && cartSizeBytes > 0
      ? Math.max(0, Math.min(1, remainDmzFileSizeBytes / cartSizeBytes))
      : null;

    return {
      cartFileCount,
      cartSizeBytes,
      cartSizeHuman: formatBytes(cartSizeBytes),
      orderedSizeBytes,
      orderedSizeHuman: formatBytes(orderedSizeBytes),
      totalOrdAndShopBytes,
      totalOrdAndShopHuman: formatBytes(totalOrdAndShopBytes),
      maxFileDownloadCount,
      remainDmzFileSizeBytes,
      remainDmzFileSizeHuman: remainDmzFileSizeBytes != null ? formatBytes(remainDmzFileSizeBytes) : null,
      fitsDailyVolumeLimit,
      overflowBytes,
      overflowHuman: overflowBytes != null ? formatBytes(overflowBytes) : null,
      retainRatio
    };
  };

  const buildRangeSuggestion = (retainRatio) => {
    const spanDays = diffDaysInclusive(beginDate, endDate);
    if (!beginDate || !endDate || !spanDays || !Number.isFinite(retainRatio) || retainRatio <= 0) return null;

    const keepDays = Math.max(1, Math.min(spanDays, Math.floor(spanDays * retainRatio)));
    const begin = parseYmd(beginDate);
    const end = parseYmd(endDate);
    if (!begin || !end) return null;

    if (shrinkDirection === 'latest') {
      return {
        policy: 'keep-latest-window',
        keepDays,
        suggestedBeginDate: formatYmd(addDays(end, -(keepDays - 1))),
        suggestedEndDate: endDate
      };
    }

    return {
      policy: 'keep-earliest-window',
      keepDays,
      suggestedBeginDate: beginDate,
      suggestedEndDate: formatYmd(addDays(begin, keepDays - 1))
    };
  };

  const buildFallback = ({status, message, quotaSummary}) => {
    const meta = statusMeta(status);
    const volumeRisk = quotaSummary?.fitsDailyVolumeLimit === false;

    if (!meta && !volumeRisk) return null;

    const fallback = {
      kind: meta?.kind || 'preflight-volume-risk',
      label: meta?.label || '当前购物车可能超出当日体量配额',
      action: meta?.action || 'shrink-and-retry',
      canAutoShrink: meta?.canAutoShrink ?? volumeRisk,
      reasonStatus: status != null ? Number(status) : null,
      reasonMessage: message || null,
      hint: meta?.hint || 'Shrink the cart to the largest continuous range that fits before retrying.'
    };

    if ((meta?.canAutoShrink || volumeRisk) && quotaSummary?.retainRatio != null) {
      fallback.retainRatio = quotaSummary.retainRatio;
      fallback.suggestedMaxCartSizeBytes = quotaSummary.remainDmzFileSizeBytes;
      fallback.suggestedMaxCartSizeHuman = quotaSummary.remainDmzFileSizeHuman;
      fallback.overflowBytes = quotaSummary.overflowBytes;
      fallback.overflowHuman = quotaSummary.overflowHuman;
      fallback.rangeSuggestion = buildRangeSuggestion(quotaSummary.retainRatio);
    }

    return fallback;
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
    const statsResp = await apiFetch('/DataPortal/v1/data/cart/substats');
    if (!statsResp.ok) {
      return {
        error: 'cart/substats HTTP ' + statsResp.status,
        hint: statsResp.status === 401 || statsResp.status === 403 ? 'Please log in to the NSMC DataPortal first' : 'Could not inspect cart before submit'
      };
    }

    const statsData = await statsResp.json();
    if (statsData.status !== 1) return {error: statsData.message || ('API status ' + statsData.status), status: statsData.status};

    const sizeResp = await apiFetch('/DataPortal/v1/data/cart/subsize');
    const sizeData = sizeResp.ok ? await sizeResp.json().catch(() => null) : null;
    const quotaSummary = buildQuotaSummary(statsData.resource || {}, sizeData?.status === 1 ? sizeData.resource || {} : {});

    const preview = {
      preview: !confirm,
      sendMail,
      ordSource,
      ftpMode,
      zipFileStatus,
      cloudStatus,
      cartStats: statsData.resource,
      cartSize: sizeData?.status === 1 ? {
        ...sizeData.resource,
        sizeOfShopHuman: formatBytes(sizeData.resource?.sizeOfShop || 0),
        sizeOfOrdHuman: formatBytes(sizeData.resource?.sizeOfOrd || 0),
        sizeOfOrdAndShopHuman: formatBytes(sizeData.resource?.sizeOfOrdAndShop || 0)
      } : null,
      quotaSummary,
      rangeContext: beginDate && endDate ? {
        beginDate,
        endDate,
        spanDays: diffDaysInclusive(beginDate, endDate),
        shrinkDirection
      } : null
    };

    const fallbackPreview = buildFallback({
      status: quotaSummary.fitsDailyVolumeLimit === false ? -4 : null,
      message: quotaSummary.fitsDailyVolumeLimit === false ? 'Cart size exceeds remaining daily download volume quota' : null,
      quotaSummary
    });

    if (!confirm) {
      return {
        ...preview,
        fallback: fallbackPreview,
        hint: 'Re-run with --confirm yes to submit the current cart'
      };
    }

    const body = {
      ordSource,
      chkIsPushMode: true,
      chkIsSendMail: sendMail,
      radioBtnlist_ftp: ftpMode,
      zipfilestatus: zipFileStatus,
      cloudStatus
    };
    const submitResp = await apiFetch('/DataPortal/v1/data/order/suborder', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json;charset=UTF-8'
      },
      body: JSON.stringify(body)
    });
    if (!submitResp.ok) return {error: 'order/suborder HTTP ' + submitResp.status, ...preview, fallback: fallbackPreview};

    const submitData = await submitResp.json().catch(() => null);
    if (!submitData) return {error: 'Invalid JSON response from order/suborder', ...preview, fallback: fallbackPreview};

    if (submitData.status !== 1) {
      return {
        error: submitData.message || ('API status ' + submitData.status),
        status: submitData.status,
        ...preview,
        fallback: buildFallback({
          status: submitData.status,
          message: submitData.message || null,
          quotaSummary
        })
      };
    }

    return {
      ...preview,
      preview: false,
      submitted: true,
      fallback: null,
      response: submitData
    };
  } catch (error) {
    return {error: error.message || String(error)};
  }
}
