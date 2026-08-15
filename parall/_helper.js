const PARALL_APP_URL = 'https://app.parall.com/';
const PARALL_API_BASE = 'https://api.parall.com/api/v1';
const PARALL_RESULT_VERSION = 'pinix.site-adapter-result.v1';

function parallError(error, hint, code) {
  return {error, hint, ...(code ? {code} : {})};
}

function parallString(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function parallOrgId(args) {
  const value = parallString(args.org_id);
  if (!/^org_[A-Za-z0-9]+$/.test(value)) {
    return {error: parallError('Missing or invalid argument: org_id', 'Provide an organization ID from parall orgs.', 'INVALID_ARGUMENT')};
  }
  return {value};
}

function parallResourceId(value, prefix, name) {
  const id = parallString(value);
  if (!id || !id.startsWith(prefix) || !/^[A-Za-z0-9_]+$/.test(id)) {
    return {error: parallError('Missing or invalid argument: ' + name, 'Provide a valid ' + name + '.', 'INVALID_ARGUMENT')};
  }
  return {value: id};
}

function parallLimit(value, fallback, maximum) {
  const parsed = Number.parseInt(value, 10);
  return Math.min(Math.max(Number.isFinite(parsed) ? parsed : fallback, 1), maximum);
}

function parallBoolean(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return null;
}

function parallQuery(entries) {
  return entries
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => encodeURIComponent(key) + '=' + encodeURIComponent(String(value)))
    .join('&');
}

function parallSafeSource(path) {
  const safePath = String(path)
    .replace(/([?&](?:cursor|token|access_token|refresh_token)=[^&]*)/gi, '')
    .replace('?&', '?')
    .replace(/[?&]$/, '');
  return PARALL_API_BASE + safePath;
}

function parallCarrier(data, metadata) {
  return {
    __pinix_site_result: {version: PARALL_RESULT_VERSION, metadata},
    data
  };
}

function parallAuth() {
  return {authenticated_as: 'unknown'};
}

function parallWarnings(extra = []) {
  return [
    {code: 'PRIVATE_WORKSPACE_DATA', message: 'Parall data is scoped to the authenticated workspace and is not public web evidence.'},
    {code: 'PROFILE_NOT_IDENTITY', message: 'The browser profile selects a session but does not independently prove the account identity.'},
    ...extra
  ];
}

function parallCompleteness(body, items) {
  if (body && body.has_more === true) return {completeness: 'partial', reason: 'pagination_available'};
  if (Array.isArray(items) && items.length === 0) return {completeness: 'empty', reason: 'no_results'};
  return {completeness: 'complete', reason: 'complete'};
}

function parallPagination(body, limit, returned) {
  return {
    ...(limit !== undefined ? {limit} : {}),
    returned,
    ...(typeof body?.has_more === 'boolean' ? {has_more: body.has_more} : {}),
    ...(body?.next_cursor ? {next_cursor: body.next_cursor} : {})
  };
}

async function parallAccessToken() {
  try {
    if (typeof localStorage !== 'undefined') {
      const token = localStorage.getItem('parall_access_token');
      if (token) return {token};
    }
  } catch {}

  if (typeof browser !== 'undefined' && browser.open) {
    try {
      const tab = await browser.open(PARALL_APP_URL);
      if (tab.waitForSelector) await tab.waitForSelector('body', 10000);
      const token = await tab.eval("localStorage.getItem('parall_access_token')");
      if (token) return {token};
      return {error: parallError('Parall session is not logged in', 'Open app.parall.com in the selected profile and log in.', 'AUTH_REQUIRED')};
    } catch {
      return {error: parallError('Parall session could not be opened', 'The Edge page was not ready or disconnected; this is not an empty result.', 'EDGE_ERROR')};
    }
  }

  return {error: parallError('Parall session is not available', 'Run this command with a profile that has an active Parall session.', 'AUTH_REQUIRED')};
}

async function parallGet(path) {
  const session = await parallAccessToken();
  if (!session.token) return {ok: false, result: session.error};

  const authorization = /^Bearer\s/i.test(session.token) ? session.token : 'Bearer ' + session.token;
  let response;
  try {
    response = await fetch(PARALL_API_BASE + path, {
      method: 'GET',
      credentials: 'include',
      headers: {Accept: 'application/json', Authorization: authorization}
    });
  } catch {
    return {ok: false, result: parallError('Parall API request failed', 'The authenticated API request failed; do not treat this as an empty workspace.', 'NETWORK_ERROR')};
  }

  let body = null;
  try { body = await response.json(); } catch {}
  if (!response.ok) {
    const code = response.status === 401 ? 'AUTH_REQUIRED' : response.status === 403 ? 'FORBIDDEN' : response.status === 404 ? 'NOT_FOUND' : response.status === 429 ? 'RATE_LIMITED' : response.status >= 500 ? 'UPSTREAM_ERROR' : 'API_ERROR';
    const hint = response.status === 401 ? 'Open Parall and log in with the selected profile.' : response.status === 403 ? 'The selected account may not have access to this organization resource.' : response.status === 429 ? 'Retry slowly after the provider rate limit clears.' : 'Parall returned an authenticated API error.';
    return {ok: false, result: parallError('Parall API returned HTTP ' + response.status, hint, code)};
  }
  return {ok: true, body};
}

function parallListResult({data, body, orgId, itemsKey, args, path, limit, extraWarnings = []}) {
  const items = Array.isArray(data) ? data : [];
  const state = parallCompleteness(body, items);
  const output = {
    ...(orgId ? {org_id: orgId} : {}),
    count: items.length,
    [itemsKey]: items,
    ...(typeof body?.has_more === 'boolean' ? {has_more: body.has_more} : {}),
    ...(body?.next_cursor ? {next_cursor: body.next_cursor} : {}),
    observed_at: new Date().toISOString()
  };
  const warnings = parallWarnings(body?.has_more === true ? [{code: 'PAGINATION_AVAILABLE', message: 'Use the returned next_cursor before treating the result as complete.'}] : extraWarnings);
  return parallCarrier(output, {
    effective_args: args,
    completeness: state.completeness,
    reason: state.reason,
    source: {url: parallSafeSource(path)},
    pagination: parallPagination(body, limit, items.length),
    auth: parallAuth(),
    warnings
  });
}
