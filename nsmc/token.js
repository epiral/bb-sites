/* @meta
{
  "name": "nsmc/token",
  "description": "从已登录的浏览器会话中获取新的 NSMC DataPortal CSRF token",
  "domain": "satellite.nsmc.org.cn",
  "args": {},
  "capabilities": ["network"],
  "readOnly": true,
  "example": "bb-browser site nsmc/token --json"
}
*/

async function(args) {
  const resp = await fetch('/DataPortal/v1/data/selection/token', {
    credentials: 'include'
  });

  if (!resp.ok) {
    return {
      error: 'HTTP ' + resp.status,
      hint: resp.status === 401 || resp.status === 403
        ? 'Please log in to the NSMC DataPortal first'
        : 'Token refresh failed'
    };
  }

  const data = await resp.json().catch(() => null);
  if (!data) return {error: 'Invalid JSON response'};
  if (data.status !== 1 || !data.resource) {
    return {
      error: data.message || ('API status ' + data.status),
      status: data.status
    };
  }

  return {
    token: data.resource,
    fetchedAt: new Date().toISOString()
  };
}
