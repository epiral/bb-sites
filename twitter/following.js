/* @meta
{
  "name": "twitter/following",
  "description": "获取首页 Following 时间线（关注的人的推文，过滤广告）",
  "domain": "x.com",
  "args": {
    "count": {"required": false, "description": "Number of tweets (default 20, max 50)"}
  },
  "capabilities": ["network"],
  "readOnly": true,
  "example": "bb-browser site twitter/following"
}
*/

async function(args) {
  const ct0 = document.cookie.split(';').map(c=>c.trim()).find(c=>c.startsWith('ct0='))?.split('=')[1];
  if (!ct0) return {error: 'No ct0 cookie', hint: 'Please log in to https://x.com first.'};
  const bearer = decodeURIComponent('AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA');
  const _h = {'Authorization':'Bearer '+bearer, 'X-Csrf-Token':ct0, 'X-Twitter-Auth-Type':'OAuth2Session', 'X-Twitter-Active-User':'yes'};

  const count = Math.min(parseInt(args.count) || 20, 50);
  const variables = JSON.stringify({
    count,
    includePromotedContent: false,
    latestControlAvailable: true,
    requestContext: 'launch',
    withCommunity: true
  });
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
    tweet_awards_web_tipping_enabled: false,
    content_disclosure_indicator_enabled: true, content_disclosure_ai_generated_indicator_enabled: true,
    freedom_of_speech_not_reach_fetch_enabled: true, standardized_nudges_misinfo: true,
    tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
    longform_notetweets_rich_text_read_enabled: true, longform_notetweets_inline_media_enabled: false,
    responsive_web_enhance_cards_enabled: false
  });

  const url = '/i/api/graphql/DiTkXJgLqBBxCs7zaYsbtA/HomeLatestTimeline?variables=' + encodeURIComponent(variables) + '&features=' + encodeURIComponent(features);
  const resp = await fetch(url, {headers: _h, credentials: 'include'});
  if (!resp.ok) return {error: 'HTTP ' + resp.status, hint: 'queryId may have changed'};
  const d = await resp.json();

  const instructions = d.data?.home?.home_timeline_urt?.instructions || [];
  let tweets = [];
  
  function extractTweet(itemContent, source) {
    if (!itemContent) return;
    if (itemContent.promotedMetadata) return;
    
    const r = itemContent.tweet_results?.result;
    if (!r) return;
    const tw = r.tweet || r;
    const l = tw.legacy || {};
    if (!tw.rest_id) return;
    const u = tw.core?.user_results?.result;
    const nt = tw.note_tweet?.note_tweet_results?.result?.text;
    const screenName = u?.legacy?.screen_name || u?.core?.screen_name;
    
    const socialContext = itemContent.socialContext;
    const src = source || socialContext?.text || null;
    
    const rt = l.retweeted_status_result?.result;
    if (rt) {
      const rtw = rt.tweet || rt; const rl = rtw.legacy || {};
      const ru = rtw.core?.user_results?.result;
      const rnt = rtw.note_tweet?.note_tweet_results?.result?.text;
      const tweet = {id: tw.rest_id, type: 'retweet', author: screenName,
        url: 'https://x.com/' + (screenName || '_') + '/status/' + tw.rest_id,
        rt_author: ru?.legacy?.screen_name || ru?.core?.screen_name, text: rnt || rl.full_text || '',
        likes: rl.favorite_count, retweets: rl.retweet_count, created_at: l.created_at};
      if (src) tweet.source = src;
      tweets.push(tweet);
    } else {
      const tweet = {id: tw.rest_id, type: l.in_reply_to_status_id_str ? 'reply' : 'tweet', author: screenName,
        name: u?.legacy?.name || u?.core?.name,
        url: 'https://x.com/' + (screenName || '_') + '/status/' + tw.rest_id,
        text: nt || l.full_text || '', likes: l.favorite_count, retweets: l.retweet_count,
        in_reply_to: l.in_reply_to_status_id_str || undefined, created_at: l.created_at};
      if (src) tweet.source = src;
      tweets.push(tweet);
    }
  }
  
  for (const inst of instructions) {
    for (const entry of (inst.entries || [])) {
      const content = entry.content;
      
      // Handle conversation modules (items array)
      if (content?.items) {
        for (const item of content.items) {
          extractTweet(item.item?.itemContent, null);
        }
        continue;
      }
      
      // Handle single tweets
      extractTweet(content?.itemContent, null);
    }
  }

  return {count: tweets.length, tweets};
}
