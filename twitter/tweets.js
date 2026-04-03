/* @meta
{
  "name": "twitter/tweets",
  "description": "获取用户最近的推文（时间线）",
  "domain": "x.com",
  "args": {
    "screen_name": {"required": true, "description": "Twitter handle (without @)"},
    "count": {"required": false, "description": "Number of tweets (default 20, max 100)"},
    "cursor": {"required": false, "description": "Pagination cursor (from previous response's next_cursor)"}
  },
  "capabilities": ["network"],
  "readOnly": true,
  "example": "bb-browser site twitter/tweets plantegg"
}
*/

async function(args) {
  if (!args.screen_name) return {error: 'Missing argument: screen_name', hint: 'Provide a Twitter handle'};
  const ct0 = document.cookie.split(';').map(c=>c.trim()).find(c=>c.startsWith('ct0='))?.split('=')[1];
  if (!ct0) return {error: 'No ct0 cookie', hint: 'Please log in to https://x.com first.'};
  const bearer = decodeURIComponent('AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA');
  const _h = {'Authorization':'Bearer '+bearer, 'X-Csrf-Token':ct0, 'X-Twitter-Auth-Type':'OAuth2Session', 'X-Twitter-Active-User':'yes'};

  // First resolve screen_name to userId
  const uVars = JSON.stringify({screen_name: args.screen_name, withSafetyModeUserFields: true});
  const uFeats = JSON.stringify({
    hidden_profile_subscriptions_enabled: true, responsive_web_graphql_exclude_directive_enabled: true,
    verified_phone_label_enabled: false, responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
    responsive_web_graphql_timeline_navigation_enabled: true
  });
  const uUrl = '/i/api/graphql/pLsOiyHJ1eFwPJlNmLp4Bg/UserByScreenName?variables=' + encodeURIComponent(uVars) + '&features=' + encodeURIComponent(uFeats);
  const uResp = await fetch(uUrl, {headers: _h, credentials: 'include'});
  if (!uResp.ok) return {error: 'Failed to resolve user: HTTP ' + uResp.status};
  const uData = await uResp.json();
  const userId = uData.data?.user?.result?.rest_id;
  if (!userId) return {error: 'User not found', hint: 'Check spelling: @' + args.screen_name};

  const count = Math.min(parseInt(args.count) || 20, 100);
  const variables = {
    userId, count, includePromotedContent: false,
    withQuickPromoteEligibilityTweetFields: true, withVoice: true
  };
  if (args.cursor) variables.cursor = args.cursor;

  const features = JSON.stringify({
    rweb_video_screen_enabled: false, profile_label_improvements_pcf_label_in_post_enabled: true,
    responsive_web_profile_redirect_enabled: false, rweb_tipjar_consumption_enabled: false,
    verified_phone_label_enabled: false, creator_subscriptions_tweet_preview_api_enabled: true,
    responsive_web_graphql_timeline_navigation_enabled: true,
    responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
    premium_content_api_read_enabled: false, communities_web_enable_tweet_community_results_fetch: true,
    c9s_tweet_anatomy_moderator_badge_enabled: true,
    articles_preview_enabled: true, responsive_web_edit_tweet_api_enabled: true,
    graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
    view_counts_everywhere_api_enabled: true, longform_notetweets_consumption_enabled: true,
    responsive_web_twitter_article_tweet_consumption_enabled: true,
    tweet_awards_web_tipping_enabled: false, freedom_of_speech_not_reach_fetch_enabled: true,
    standardized_nudges_misinfo: true,
    tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
    longform_notetweets_rich_text_read_enabled: true, longform_notetweets_inline_media_enabled: false,
    responsive_web_enhance_cards_enabled: false
  });
  const fieldToggles = JSON.stringify({withArticlePlainText: false});
  const url = '/i/api/graphql/Y59DTUMfcKmUAATiT2SlTw/UserTweets?variables=' + encodeURIComponent(JSON.stringify(variables)) + '&features=' + encodeURIComponent(features) + '&fieldToggles=' + encodeURIComponent(fieldToggles);
  const resp = await fetch(url, {headers: _h, credentials: 'include'});
  if (!resp.ok) return {error: 'HTTP ' + resp.status, hint: 'queryId may have changed'};
  const d = await resp.json();

  const instructions = d.data?.user?.result?.timeline_v2?.timeline?.instructions || d.data?.user?.result?.timeline?.timeline?.instructions || [];
  let tweets = [];
  let next_cursor = null;
  for (const inst of instructions) {
    for (const entry of (inst.entries || [])) {
      // Extract cursor for pagination
      if (entry.entryId?.startsWith('cursor-bottom-')) {
        next_cursor = entry.content?.value;
        continue;
      }
      const r = entry.content?.itemContent?.tweet_results?.result;
      if (!r) continue;
      const tw = r.tweet || r;
      const l = tw.legacy || {};
      if (!tw.rest_id) continue;
      const u = tw.core?.user_results?.result;
      const nt = tw.note_tweet?.note_tweet_results?.result?.text;
      // skip retweets unless they have quote content
      const rt = l.retweeted_status_result?.result;
      if (rt) {
        const rtw = rt.tweet || rt; const rl = rtw.legacy || {};
        const ru = rtw.core?.user_results?.result;
        const rnt = rtw.note_tweet?.note_tweet_results?.result?.text;
        const authorName = u?.legacy?.screen_name || u?.core?.screen_name;
        tweets.push({id: tw.rest_id, type: 'retweet', author: authorName,
          url: 'https://x.com/' + (authorName || '_') + '/status/' + tw.rest_id,
          rt_author: ru?.legacy?.screen_name || ru?.core?.screen_name, text: rnt || rl.full_text || '',
          likes: rl.favorite_count, retweets: rl.retweet_count, replies: rl.reply_count, created_at: l.created_at});
      } else {
        const authorName = u?.legacy?.screen_name || u?.core?.screen_name;
        tweets.push({id: tw.rest_id, type: 'tweet', author: authorName,
          url: 'https://x.com/' + (authorName || '_') + '/status/' + tw.rest_id,
          text: nt || l.full_text || '', likes: l.favorite_count, retweets: l.retweet_count, replies: l.reply_count,
          in_reply_to: l.in_reply_to_status_id_str || undefined, created_at: l.created_at});
      }
    }
  }

  const result = {screen_name: args.screen_name, user_id: userId, count: tweets.length, tweets};
  if (next_cursor) result.next_cursor = next_cursor;
  return result;
}
