const PARALL_APP_URL = 'https://app.parall.com/';
// Explicit adapter configuration. Pinix does not infer or inject this origin.
const PARALL_API_ORIGIN = 'https://api.parall.com';
const PARALL_API_BASE = PARALL_API_ORIGIN + '/api/v1';
const PARALL_RESULT_VERSION = 'pinix.site-adapter-result.v1';

function parallError(error, hint, code, extra = {}) {
  return {error, hint, ...(code ? {code} : {}), ...extra};
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

function parallQuery(entries) {
  return entries
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => encodeURIComponent(key) + '=' + encodeURIComponent(String(value)))
    .join('&');
}

function parallSafeErrorValue(value, depth = 0) {
  if (depth > 4) return '[truncated]';
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => parallSafeErrorValue(item, depth + 1));
  if (typeof value !== 'object') return undefined;
  const output = {};
  for (const [key, item] of Object.entries(value).slice(0, 50)) {
    if (/token|secret|api[_-]?key|cookie|authorization|password|jwt/i.test(key)) {
      output[key] = '[redacted]';
      continue;
    }
    const safe = parallSafeErrorValue(item, depth + 1);
    if (safe !== undefined) output[key] = safe;
  }
  return output;
}

function parallErrorFromResponse(status, body, headers) {
  const nested = body && typeof body.error === 'object' && !Array.isArray(body.error) ? body.error : {};
  const legacyMessage = typeof body?.error === 'string' ? body.error : null;
  const code = typeof nested.code === 'string' ? nested.code : status === 401 ? 'AUTH_REQUIRED' : status === 403 ? 'FORBIDDEN' : status === 404 ? 'NOT_FOUND' : status === 409 ? 'CONFLICT' : status === 422 ? 'UNPROCESSABLE' : status === 429 ? 'RATE_LIMITED' : status >= 500 ? 'UPSTREAM_ERROR' : 'API_ERROR';
  const message = typeof nested.message === 'string' ? nested.message : legacyMessage || 'Parall API returned HTTP ' + status;
  const hint = status === 401 ? 'The Parall page session could not authorize this API request. Do not extract a JWT; use a supported page-session route or an approved bridge.' : status === 403 ? 'The selected principal may not have access to this resource.' : status === 429 ? 'Respect Retry-After and reduce request frequency; it is pacing guidance, not retry authorization.' : 'Parall returned an authenticated API error.';
  const extra = {http_status: status};
  if (typeof nested.action === 'string') extra.action = nested.action;
  if (typeof nested.resource_uri === 'string' && nested.resource_uri.startsWith('prll://')) extra.resource_uri = nested.resource_uri;
  if (typeof nested.approvable === 'boolean') extra.approvable = nested.approvable;
  if (nested.details !== undefined) extra.details = parallSafeErrorValue(nested.details);
  const retryAfter = headers?.get?.('Retry-After');
  if (retryAfter !== null && retryAfter !== undefined && /^\d+(?:\.\d+)?$/.test(String(retryAfter))) extra.retry_after_seconds = Number(retryAfter);
  return parallError(message, hint, code, extra);
}

function parallSafeSource(path) {
  const safePath = String(path)
    .replace(/([?&](?:cursor|before|after|token|access_token|refresh_token)=[^&]*)/gi, '')
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

async function parallGet(path) {
  if (typeof browser === 'undefined' || typeof browser.open !== 'function') {
    return {ok: false, result: parallError('Parall page session is not available', 'Run this command with a signed-in Parall browser profile. The adapter does not read JWTs from browser storage.', 'AUTH_REQUIRED')};
  }

  let tab;
  try {
    tab = await browser.open(PARALL_APP_URL);
    if (tab.waitForSelector) await tab.waitForSelector('body', 10000);
    if (typeof tab.eval !== 'function') {
      return {ok: false, result: parallError('Parall page session cannot issue requests', 'The selected Edge does not expose a page request surface.', 'EDGE_ERROR')};
    }

    const url = PARALL_API_BASE + path;
    const response = await tab.eval(`(async () => {
      try {
        const response = await fetch(${JSON.stringify(url)}, {method: 'GET', credentials: 'include', headers: {Accept: 'application/json'}});
        const contentType = response.headers.get('content-type') || '';
        let body = null;
        try { body = contentType.includes('json') ? await response.json() : await response.text(); } catch {}
        return {ok: response.ok, status: response.status, retry_after: response.headers.get('Retry-After'), body};
      } catch (error) {
        return {ok: false, status: 0, network_error: String(error?.message || error)};
      }
    })()`);

    if (!response || typeof response !== 'object') {
      return {ok: false, result: parallError('Parall page request returned no response', 'The page session did not return a structured HTTP response.', 'EDGE_ERROR')};
    }
    if (response.status === 0 || response.network_error) {
      return {ok: false, result: parallError('Parall API request failed in page session', 'The page-session request failed; do not treat this as an empty workspace.', 'NETWORK_ERROR')};
    }
    const headers = {get: (name) => String(name).toLowerCase() === 'retry-after' ? response.retry_after : null};
    if (!response.ok) return {ok: false, result: parallErrorFromResponse(response.status, response.body, headers)};
    return {ok: true, body: response.body};
  } catch {
    return {ok: false, result: parallError('Parall page session could not be opened', 'The Edge page was not ready or disconnected; this is not an empty result.', 'EDGE_ERROR')};
  }
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
