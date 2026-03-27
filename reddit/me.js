/* @meta
{
  "name": "reddit/me",
  "description": "获取当前 Reddit 登录用户信息",
  "domain": "www.reddit.com",
  "args": {},
  "capabilities": ["network"],
  "readOnly": true
}
*/

async function(args) {
  // /api/me.json no longer returns user info (2025+).
  // Strategy: extract the current-user-id from Reddit page markup, resolve username, then fetch full profile.

  // 1. Extract t2_XXXXX user ID from the current Reddit page markup
  const html = document.documentElement.outerHTML;
  const idMatch = html.match(/current-user-id="(t2_[a-z0-9]+)"/) ||
    html.match(/user-id="(t2_[a-z0-9]+)"/);
  if (!idMatch) return {error: 'Not logged in', hint: 'Not logged in? Open reddit.com and log in.'};
  const userId = idMatch[1];

  // 2. Resolve username via user_data_by_account_ids
  const idResp = await fetch('/api/user_data_by_account_ids.json?ids=' + userId, {credentials: 'include'});
  if (!idResp.ok) return {error: 'HTTP ' + idResp.status, hint: 'Not logged in? Open reddit.com and log in.'};
  const idData = await idResp.json();
  const username = idData[userId]?.name;
  if (!username) return {error: 'Cannot resolve username for ' + userId, hint: 'Not logged in? Open reddit.com and log in.'};

  // 3. Fetch full profile via /user/USERNAME/about.json
  const resp = await fetch('/user/' + username + '/about.json', {credentials: 'include'});
  if (!resp.ok) return {error: 'HTTP ' + resp.status, hint: 'Profile fetch failed'};
  const d = await resp.json();
  if (!d.data?.name) return {error: 'Unexpected response', hint: 'Not logged in? Open reddit.com and log in.'};
  return {
    name: d.data.name,
    id: d.data.id,
    url: 'https://www.reddit.com/user/' + d.data.name,
    comment_karma: d.data.comment_karma,
    link_karma: d.data.link_karma,
    total_karma: d.data.total_karma,
    created_utc: d.data.created_utc
  };
}
