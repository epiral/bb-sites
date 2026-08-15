/* @meta
{
  "name": "twitter/status",
  "description": "Fetch a single tweet by ID or URL",
  "domain": "x.com",
  "args": {
    "tweet_id": {"required": true, "description": "Tweet ID or full x.com URL"}
  },
  "capabilities": ["network"],
  "readOnly": true,
  "example": "bb-browser site twitter/status 2059658208893940067"
}
*/

async function(args) {
  if (!args.tweet_id) return {error: 'Missing argument: tweet_id', hint: 'Provide a tweet ID or x.com URL'};

  let tweetId = args.tweet_id;
  const urlMatch = tweetId.match(/x\.com\/\w+\/status\/(\d+)/);
  if (urlMatch) tweetId = urlMatch[1];
  if (!/^\d+$/.test(tweetId)) return {error: 'Invalid tweet ID', hint: 'Provide a numeric tweet ID or x.com URL'};

  const ct0 = document.cookie.split(';').map(c=>c.trim()).find(c=>c.startsWith('ct0='))?.split('=')[1];
  if (!ct0) return {error: 'No ct0 cookie', hint: 'Please log in to https://x.com first.'};

  const bearer = 'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';

  // Discover queryId from webpack
  let __webpack_require__;
  window.webpackChunk_twitter_responsive_web.push([['__bb_st_' + Date.now()], {}, (req) => { __webpack_require__ = req; }]);

  let queryId = 'V1ze5q3ijDS1VeLwLY0m7g';
  for (const id of Object.keys(__webpack_require__.m)) {
    try {
      const m = __webpack_require__.m[id].toString().match(/queryId:\s*"([^"]+)"\s*,\s*operationName:\s*"TweetDetail"/);
      if (m) { queryId = m[1]; break; }
    } catch {}
  }

  const _h = {
    'Authorization': 'Bearer ' + bearer, 'X-Csrf-Token': ct0,
    'X-Twitter-Auth-Type': 'OAuth2Session', 'X-Twitter-Active-User': 'yes',
    'X-Twitter-Client-Language': 'en'
  };

  const variables = JSON.stringify({
    focalTweetId: tweetId, with_rux_injections: false,
    includePromotedContent: true, withCommunity: true,
    withQuickPromoteEligibilityTweetFields: true,
    withBirdwatchNotes: true, withVoice: true
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
    tweet_awards_web_tipping_enabled: false, freedom_of_speech_not_reach_fetch_enabled: true,
    standardized_nudges_misinfo: true,
    tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
    longform_notetweets_rich_text_read_enabled: true, longform_notetweets_inline_media_enabled: false,
    responsive_web_enhance_cards_enabled: false
  });

  const url = '/i/api/graphql/' + queryId + '/TweetDetail?variables=' + encodeURIComponent(variables) + '&features=' + encodeURIComponent(features);
  const resp = await fetch(url, {headers: _h, credentials: 'include'});
  if (!resp.ok) return {error: 'HTTP ' + resp.status, hint: 'queryId may have changed'};
  const d = await resp.json();

  const instructions = d.data?.threaded_conversation_with_injections_v2?.instructions || [];
  let tweets = [];
  let focal = null;

  for (const inst of instructions) {
    for (const entry of (inst.entries || [])) {
      const r = entry.content?.itemContent?.tweet_results?.result;
      if (!r) continue;
      const tw = r.tweet || r;
      const l = tw.legacy || {};
      if (!tw.rest_id) continue;
      const u = tw.core?.user_results?.result;
      const nt = tw.note_tweet?.note_tweet_results?.result?.text;
      const rt = l.retweeted_status_result?.result;
      const authorName = u?.legacy?.screen_name || u?.core?.screen_name;

      const tweet = {
        id: tw.rest_id, author: authorName,
        name: u?.legacy?.name || u?.core?.name,
        url: 'https://x.com/' + (authorName || '_') + '/status/' + tw.rest_id,
        text: nt || l.full_text || '',
        likes: l.favorite_count, retweets: l.retweet_count, replies: l.reply_count,
        created_at: l.created_at, lang: l.lang
      };

      if (rt) {
        const rtw = rt.tweet || rt; const rl = rtw.legacy || {};
        const ru = rtw.core?.user_results?.result;
        const rnt = rtw.note_tweet?.note_tweet_results?.result?.text;
        tweet.type = 'retweet';
        tweet.rt_author = ru?.legacy?.screen_name || ru?.core?.screen_name;
        tweet.rt_text = rnt || rl.full_text || '';
      } else {
        tweet.type = (tw.rest_id === tweetId) ? 'focal' : 'thread';
      }

      if (tw.rest_id === tweetId) focal = tweet;
      tweets.push(tweet);
    }
  }

  return {tweet_id: tweetId, count: tweets.length, focal, tweets};
}
