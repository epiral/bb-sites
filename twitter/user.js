/* @meta
{
  "name": "twitter/user",
  "description": "获取 Twitter 用户 profile",
  "domain": "x.com",
  "args": {
    "screen_name": {"required": true, "description": "Twitter handle (without @)"}
  },
  "capabilities": ["network"],
  "readOnly": true,
  "example": "bb-browser site twitter/user yan5xu"
}
*/

async function(args) {
  if (!args.screen_name) return {error: 'Missing argument: screen_name', hint: 'Provide a Twitter handle'};
  const ct0 = document.cookie.split(';').map(c=>c.trim()).find(c=>c.startsWith('ct0='))?.split('=')[1];
  if (!ct0) return {error: 'No ct0 cookie', hint: 'Not logged into x.com. Open x.com and log in first.'};
  const bearer = decodeURIComponent('AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA');
  const _h = {'Authorization':'Bearer '+bearer, 'X-Csrf-Token':ct0, 'X-Twitter-Auth-Type':'OAuth2Session', 'X-Twitter-Active-User':'yes'};

  const variables = JSON.stringify({screen_name: args.screen_name, withSafetyModeUserFields: true});
  const features = JSON.stringify({
    hidden_profile_subscriptions_enabled: true, responsive_web_graphql_exclude_directive_enabled: true,
    verified_phone_label_enabled: false, responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
    responsive_web_graphql_timeline_navigation_enabled: true
  });
  const url = '/i/api/graphql/pLsOiyHJ1eFwPJlNmLp4Bg/UserByScreenName?variables=' + encodeURIComponent(variables) + '&features=' + encodeURIComponent(features);
  const resp = await fetch(url, {headers: _h, credentials: 'include'});
  if (!resp.ok) return {error: 'HTTP ' + resp.status, hint: 'queryId may have changed. Check network tab.'};
  const d = await resp.json();
  const u = d.data?.user?.result;
  if (!u) return {error: 'User not found', hint: 'Check spelling: @' + args.screen_name};
  const l = u.legacy || {};
  const screenName = l.screen_name || u?.core?.screen_name || args.screen_name;
  return {id: u.rest_id, name: l.name || u?.core?.name, screen_name: screenName, bio: l.description,
    url: 'https://x.com/' + screenName,
    followers: l.followers_count, following: l.friends_count, tweets: l.statuses_count, verified: u.is_blue_verified};
}
