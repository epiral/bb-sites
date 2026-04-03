/* @meta
{
  "name": "twitter/reply",
  "description": "Reply to a tweet",
  "domain": "x.com",
  "args": {
    "tweet_id": {"required": true, "description": "Tweet ID to reply to (numeric or full URL)"},
    "text": {"required": true, "description": "Reply text"}
  },
  "capabilities": ["network"],
  "readOnly": false,
  "example": "bb-browser site twitter/reply 2032858943874281782 \"Thanks!\""
}
*/

async function(args) {
  if (!args.tweet_id) return {error: 'Missing argument: tweet_id'};
  if (!args.text) return {error: 'Missing argument: text'};
  const ct0 = document.cookie.split(';').map(c=>c.trim()).find(c=>c.startsWith('ct0='))?.split('=')[1];
  if (!ct0) return {error: 'No ct0 cookie', hint: 'Not logged into x.com'};
  const bearer = decodeURIComponent('AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA');
  const _h = {'Content-Type':'application/json', 'Authorization':'Bearer '+bearer, 'X-Csrf-Token':ct0, 'X-Twitter-Auth-Type':'OAuth2Session', 'X-Twitter-Active-User':'yes'};

  let tweetId = args.tweet_id;
  const urlMatch = tweetId.match(/\/status\/(\d+)/);
  if (urlMatch) tweetId = urlMatch[1];

  const body = {
    variables: {
      tweet_text: args.text,
      reply: { in_reply_to_tweet_id: tweetId, exclude_reply_user_ids: [] },
      dark_request: false, media: { media_entities: [], possibly_sensitive: false },
      semantic_annotation_ids: []
    },
    features: {
      communities_web_enable_tweet_community_results_fetch: true,
      c9s_tweet_anatomy_moderator_badge_enabled: true,
      responsive_web_edit_tweet_api_enabled: true,
      graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
      view_counts_everywhere_api_enabled: true,
      longform_notetweets_consumption_enabled: true,
      responsive_web_twitter_article_tweet_consumption_enabled: true,
      tweet_awards_web_tipping_enabled: false,
      creator_subscriptions_quote_tweet_preview_enabled: false,
      longform_notetweets_rich_text_read_enabled: true,
      longform_notetweets_inline_media_enabled: true,
      articles_preview_enabled: true,
      rweb_video_timestamps_enabled: true,
      rweb_tipjar_consumption_enabled: true,
      responsive_web_graphql_exclude_directive_enabled: true,
      verified_phone_label_enabled: false,
      freedom_of_speech_not_reach_fetch_enabled: true,
      standardized_nudges_misinfo: true,
      tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
      responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
      responsive_web_graphql_timeline_navigation_enabled: true,
      responsive_web_enhance_cards_enabled: false
    },
    queryId: 'oB-5XsHNAbjvARJEc8CZFw'
  };

  const resp = await fetch('/i/api/graphql/oB-5XsHNAbjvARJEc8CZFw/CreateTweet', {
    method: 'POST', headers: _h, credentials: 'include', body: JSON.stringify(body)
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    return {error: 'HTTP ' + resp.status, detail: errText, hint: 'Reply failed. Check login state.'};
  }

  const d = await resp.json();
  const result = d.data?.create_tweet?.tweet_results?.result;
  const tw = result?.tweet || result;
  const l = tw?.legacy || {};
  const u = tw?.core?.user_results?.result;
  const screenName = u?.legacy?.screen_name || u?.core?.screen_name;

  return {
    success: true,
    id: tw?.rest_id,
    text: l.full_text || args.text,
    url: 'https://x.com/' + (screenName || '_') + '/status/' + (tw?.rest_id || ''),
    in_reply_to: tweetId
  };
}
