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

function parallOpaqueId(value, name) {
  const id = parallString(value);
  if (!id || !/^[A-Za-z0-9_-]+$/.test(id)) {
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

function parallSafeValue(value, depth = 0) {
  if (depth > 4) return '[truncated]';
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.slice(0, 200).map((item) => parallSafeValue(item, depth + 1));
  if (typeof value !== 'object') return undefined;
  const output = {};
  for (const [key, item] of Object.entries(value).slice(0, 200)) {
    if (/token|secret|api[_-]?key|private[_-]?key|credential|cookie|authorization|password|jwt|provider[_-]?error|raw[_-]?error/i.test(key)) {
      output[key] = '[redacted]';
      continue;
    }
    const safe = parallSafeValue(item, depth + 1);
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
  if (nested.details !== undefined) extra.details = parallSafeValue(nested.details);
  const retryAfter = headers?.get?.('Retry-After');
  if (retryAfter !== null && retryAfter !== undefined && /^\d+(?:\.\d+)?$/.test(String(retryAfter))) extra.retry_after_seconds = Number(retryAfter);
  return parallError(message, hint, code, extra);
}

function parallSafeSource(path) {
  const source = new URL(PARALL_API_BASE + String(path));
  for (const key of ['cursor', 'before', 'after', 'q', 'token', 'access_token', 'refresh_token', 'authorization', 'api_key', 'secret', 'password', 'jwt']) {
    source.searchParams.delete(key);
  }
  source.username = '';
  source.password = '';
  source.hash = '';
  return source.toString();
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
    {code: 'PAGE_BEARER_SESSION', message: 'The Parall access token was read and used only inside the page renderer; no credential value was returned to the adapter runtime.'},
    ...extra
  ];
}

function parallGovernanceWarnings(extra = []) {
  return parallWarnings([
    {code: 'GOVERNANCE_SCOPED_DATA', message: 'This endpoint may return governance-scoped or redacted data depending on the authenticated principal and resource context.'},
    ...extra
  ]);
}

function parallCompleteness(body, items) {
  if (body && body.has_more === true) {
    return {
      completeness: 'partial',
      reason: body.next_cursor ? 'pagination_available' : 'pagination_cursor_unavailable'
    };
  }
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

function parallInvalidResponse(expected) {
  return parallError('Invalid Parall API response', 'Expected ' + expected + '; do not treat a malformed success response as empty.', 'INVALID_RESPONSE');
}

async function parallGet(path) {
  if (typeof browser === 'undefined' || typeof browser.open !== 'function') {
    return {ok: false, result: parallError('Parall page session is not available', 'Run this command with a signed-in Parall browser profile. Page credentials are used only inside the renderer.', 'AUTH_REQUIRED')};
  }

  let tab;
  try {
    tab = await browser.open(PARALL_APP_URL);
    if (tab.waitForSelector) await tab.waitForSelector('body', 10000);
    if (typeof tab.eval !== 'function') {
      return {ok: false, result: parallError('Parall page session cannot issue requests', 'The selected Edge does not expose a page request surface.', 'EDGE_ERROR')};
    }

    const response = await tab.eval(`(async () => {
      const targetPath = ${JSON.stringify(path)};
      const appToApiOrigin = {
        "https://app.parall.com": "https://api.parall.com",
        "https://app.staging.prll.sh": "https://api.staging.prll.sh"
      };
      const apiOrigin = appToApiOrigin[location.origin] || null;
      if (!apiOrigin) {
        return {ok: false, status: 0, bridge_error: "UNSUPPORTED_PARALL_APP_ORIGIN"};
      }
      if (!targetPath.startsWith("/") || targetPath.startsWith("//") || targetPath.includes("#")) {
        return {ok: false, status: 0, bridge_error: "INVALID_PARALL_API_PATH"};
      }

      if (typeof window.fetch !== "function") {
        return {ok: false, status: 0, bridge_error: "FRONTEND_FETCH_UNAVAILABLE"};
      }

      let accessToken = null;
      try {
        try {
          accessToken = window.localStorage?.getItem("parall_access_token") || null;
        } catch {
          return {ok: false, status: 0, bridge_error: "PAGE_CREDENTIAL_STORAGE_UNAVAILABLE", api_origin: apiOrigin};
        }
        if (!accessToken) {
          return {ok: false, status: 0, bridge_error: "PAGE_ACCESS_TOKEN_NOT_FOUND", api_origin: apiOrigin};
        }

        const requestUrl = new URL(apiOrigin + "/api/v1" + targetPath);
        if (requestUrl.origin !== apiOrigin || !requestUrl.pathname.startsWith("/api/v1/")) {
          return {ok: false, status: 0, bridge_error: "INVALID_PARALL_API_PATH"};
        }
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        let response;
        try {
          response = await window.fetch(requestUrl.toString(), {
            method: "GET",
            headers: {Accept: "application/json", Authorization: "Bearer " + accessToken},
            credentials: "omit",
            redirect: "error",
            signal: controller.signal
          });
        } finally {
          clearTimeout(timeout);
        }
        const contentType = response.headers.get('content-type') || '';
        let body = null;
        try { body = contentType.includes('json') ? await response.json() : await response.text(); } catch {}
        return {
          ok: response.ok,
          status: response.status,
          retry_after: response.headers.get('Retry-After'),
          body,
          api_origin: apiOrigin,
          auth_mode: "page_renderer_bearer"
        };
      } catch {
        return {ok: false, status: 0, network_error: "page_request_failed"};
      } finally {
        accessToken = null;
      }
    })()`);

    if (!response || typeof response !== 'object') {
      return {ok: false, result: parallError('Parall page request returned no response', 'The page session did not return a structured HTTP response.', 'EDGE_ERROR')};
    }
    if (response.bridge_error === 'PAGE_ACCESS_TOKEN_NOT_FOUND' || response.bridge_error === 'PAGE_CREDENTIAL_STORAGE_UNAVAILABLE') {
      return {ok: false, result: parallError('Parall page credentials are unavailable', 'Open Parall with the selected browser profile and sign in before retrying.', 'AUTH_REQUIRED')};
    }
    if (response.bridge_error) {
      return {ok: false, result: parallError('Parall frontend request bridge is unavailable', 'The selected page origin or runtime cannot provide the bounded frontend GET reuse path.', 'EDGE_ERROR', {bridge_error: response.bridge_error})};
    }
    if (response.status === 0 || response.network_error) {
      return {ok: false, result: parallError('Parall API request failed in page session', 'The page-session request failed; do not treat this as an empty workspace.', 'NETWORK_ERROR')};
    }
    const headers = {get: (name) => String(name).toLowerCase() === 'retry-after' ? response.retry_after : null};
    if (!response.ok) return {ok: false, result: parallErrorFromResponse(response.status, response.body, headers)};
    return {ok: true, body: response.body, apiOrigin: response.api_origin, authMode: response.auth_mode};
  } catch {
    return {ok: false, result: parallError('Parall page session could not be opened', 'The Edge page was not ready or disconnected; this is not an empty result.', 'EDGE_ERROR')};
  } finally {
    try { if (tab?.close) await tab.close(); } catch {}
  }
}

function parallListResult({data, body, orgId, itemsKey, args, path, limit, extraWarnings = [], governance = false}) {
  if (!Array.isArray(data)) return parallInvalidResponse('an array in the documented response field');
  const items = parallSafeValue(data);
  const state = parallCompleteness(body, items);
  const output = {
    ...(orgId ? {org_id: orgId} : {}),
    count: items.length,
    [itemsKey]: items,
    ...(typeof body?.has_more === 'boolean' ? {has_more: body.has_more} : {}),
    ...(body?.next_cursor ? {next_cursor: body.next_cursor} : {}),
    observed_at: new Date().toISOString()
  };
  const paginationWarnings = body?.has_more === true
    ? body?.next_cursor
      ? [{code: 'PAGINATION_AVAILABLE', message: 'Use the returned next_cursor before treating the result as complete.'}]
      : [{code: 'PAGINATION_CURSOR_UNAVAILABLE', message: 'The provider reports more results but this endpoint did not return a continuation cursor; do not invent one.'}]
    : [];
  const warnings = governance
    ? parallGovernanceWarnings([...paginationWarnings, ...extraWarnings])
    : parallWarnings([...paginationWarnings, ...extraWarnings]);
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

function parallObjectResult({data, orgId, dataKey, args, path, reason = 'complete', extraWarnings = [], governance = false}) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return parallInvalidResponse('a JSON object');
  const safe = parallSafeValue(data);
  const output = {
    ...(orgId ? {org_id: orgId} : {}),
    [dataKey]: safe,
    observed_at: new Date().toISOString()
  };
  return parallCarrier(output, {
    effective_args: args,
    completeness: 'complete',
    reason,
    source: {url: parallSafeSource(path)},
    pagination: {supported: false, returned: 1},
    auth: parallAuth(),
    warnings: governance ? parallGovernanceWarnings(extraWarnings) : parallWarnings(extraWarnings)
  });
}

async function parallReadList({path, orgId, itemsKey, args, limit, extraWarnings = [], governance = false}) {
  const result = await parallGet(path);
  if (!result.ok) return result.result;
  return parallListResult({
    data: result.body?.data,
    body: result.body,
    orgId,
    itemsKey,
    args,
    path,
    limit,
    extraWarnings,
    governance
  });
}

async function parallReadObject({path, orgId, dataKey, args, nestedKey, reason, extraWarnings = [], governance = false}) {
  const result = await parallGet(path);
  if (!result.ok) return result.result;
  const data = nestedKey ? result.body?.[nestedKey] : result.body;
  return parallObjectResult({data, orgId, dataKey, args, path, reason, extraWarnings, governance});
}
