/* @meta
{
  "name": "nsmc/order-url",
  "description": "获取 NSMC DataPortal 订单的 FTP 投递信息",
  "domain": "satellite.nsmc.org.cn",
  "args": {
    "ordercode": {"required": true, "description": "订单号，例如 A202603290318022067"}
  },
  "capabilities": ["network"],
  "readOnly": true,
  "example": "bb-browser site nsmc/order-url A202603290318022067"
}
*/

async function(args) {
  const ordercode = (args.ordercode || '').trim();
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

  const resp = await apiFetch('/DataPortal/v1/data/order/' + encodeURIComponent(ordercode) + '/url');
  if (!resp.ok) {
    return {
      error: 'HTTP ' + resp.status,
      hint: resp.status === 401 || resp.status === 403 ? 'Please log in to the NSMC DataPortal first' : 'Order URL lookup failed'
    };
  }
  const data = await resp.json().catch(() => null);
  if (!data) return {error: 'Invalid JSON response'};
  if (data.status !== 1) {
    return {
      error: data.message || ('API status ' + data.status),
      status: data.status,
      ordercode
    };
  }

  const resource = data.resource || {};
  const targetServer = resource.TARGETSERVER || resource.targetserver || null;
  const serverPort = resource.SERVERPORT || resource.serverport || null;
  const ftpAccount = resource.FTPACCOUNT || resource.ftpaccount || null;
  const ftpPassword = resource.FTPPASSWORD || resource.ftppassword || null;

  return {
    ordercode,
    targetServer,
    serverPort,
    ftpAccount,
    ftpPassword,
    ftpUrl: targetServer && serverPort && ftpAccount && ftpPassword
      ? `ftp://${ftpAccount}:${ftpPassword}@${targetServer}:${serverPort}`
      : null,
    resource
  };
}
