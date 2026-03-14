/* @meta
{
  "name": "twitter/notifications",
  "description": "获取 Twitter 通知（点赞、转发、回复、关注等）",
  "domain": "x.com",
  "args": {
    "count": {"required": false, "description": "Number of notifications (default 20, max 50)"}
  },
  "capabilities": ["network"],
  "readOnly": true,
  "example": "bb-browser site twitter/notifications"
}
*/

async function(args) {
  const ct0 = document.cookie.split(';').map(c=>c.trim()).find(c=>c.startsWith('ct0='))?.split('=')[1];
  if (!ct0) return {error: 'No ct0 cookie', hint: 'Please log in to https://x.com first.'};
  const bearer = decodeURIComponent('AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA');
  const _h = {'Authorization':'Bearer '+bearer, 'X-Csrf-Token':ct0, 'X-Twitter-Auth-Type':'OAuth2Session', 'X-Twitter-Active-User':'yes'};

  const count = Math.min(parseInt(args.count) || 20, 50);
  const variables = JSON.stringify({timeline_type: 'All', count});
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
  const url = '/i/api/graphql/3Jx0YXHGICZsBxDlRrfQnw/NotificationsTimeline?variables=' + encodeURIComponent(variables) + '&features=' + encodeURIComponent(features);
  const resp = await fetch(url, {headers: _h, credentials: 'include'});
  if (!resp.ok) return {error: 'HTTP ' + resp.status, hint: 'queryId may have changed'};
  const d = await resp.json();

  const instructions = d.data?.viewer_v2?.user_results?.result?.notification_timeline?.timeline?.instructions || [];
  const iconMap = {heart_icon:'like', retweet_icon:'retweet', person_icon:'follow', reply_icon:'reply', bell_icon:'mention'};
  let notifications = [];
  for (const inst of instructions) {
    if (inst.type !== 'TimelineAddEntries') continue;
    for (const entry of (inst.entries || [])) {
      const ic = entry.content?.itemContent;
      if (!ic || ic.__typename !== 'TimelineNotification') continue;
      const icon = ic.notification_icon || '';
      const type = iconMap[icon] || ic.clientEventInfo?.element || icon.replace('_icon','');
      const eventType = entry.content?.clientEventInfo?.element || type;
      // Extract users from rich_message entities
      const users = (ic.rich_message?.entities || [])
        .filter(e => e.ref?.type === 'TimelineRichTextUser')
        .map(e => {
          const u = e.ref?.user_results?.result;
          return u?.legacy?.screen_name || u?.core?.screen_name;
        }).filter(Boolean);
      // Extract message text
      const msgText = ic.rich_message?.text || '';
      // Extract linked tweet/url
      const linkedUrl = ic.notification_url?.url || '';
      notifications.push({type: eventType, icon: type, users, message: msgText, url: linkedUrl, id: ic.id});
    }
  }

  return {count: notifications.length, notifications};
}
