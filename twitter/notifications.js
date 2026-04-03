/* @meta
{
  "name": "twitter/notifications",
  "description": "获取 Twitter 通知（点赞、转发、回复、关注、提及等）",
  "domain": "x.com",
  "args": {
    "type": {"required": false, "description": "Notification type: all (default), mentions, likes, retweets"},
    "count": {"required": false, "description": "Number of notifications (default 20, max 50)"},
    "cursor": {"required": false, "description": "Pagination cursor (from previous response's next_cursor)"}
  },
  "capabilities": ["network"],
  "readOnly": true,
  "example": "bb-browser site twitter/notifications --type mentions"
}
*/

async function(args) {
  const ct0 = document.cookie.split(';').map(c=>c.trim()).find(c=>c.startsWith('ct0='))?.split('=')[1];
  if (!ct0) return {error: 'No ct0 cookie', hint: 'Please log in to https://x.com first.'};
  const bearer = decodeURIComponent('AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA');
  const _h = {'Authorization':'Bearer '+bearer, 'X-Csrf-Token':ct0, 'X-Twitter-Auth-Type':'OAuth2Session', 'X-Twitter-Active-User':'yes'};

  const count = Math.min(parseInt(args.count) || 20, 50);
  const type = (args.type || 'all').toLowerCase();

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

  const iconMap = {heart_icon:'like', retweet_icon:'retweet', person_icon:'follow', reply_icon:'reply', bell_icon:'mention'};

  // Helper: fetch engagement notifications (likes, retweets, follows)
  async function fetchEngagement(cursor) {
    const variables = {timeline_type: 'All', count};
    if (cursor) variables.cursor = cursor;
    const url = '/i/api/graphql/3Jx0YXHGICZsBxDlRrfQnw/NotificationsTimeline?variables=' + encodeURIComponent(JSON.stringify(variables)) + '&features=' + encodeURIComponent(features);
    const resp = await fetch(url, {headers: _h, credentials: 'include'});
    if (!resp.ok) return {items: [], next_cursor: null, error: 'HTTP ' + resp.status};
    const d = await resp.json();
    const instructions = d.data?.viewer_v2?.user_results?.result?.notification_timeline?.timeline?.instructions || [];
    const items = [];
    let next_cursor = null;
    for (const inst of instructions) {
      if (inst.type !== 'TimelineAddEntries') continue;
      for (const entry of (inst.entries || [])) {
        if (entry.entryId?.startsWith('cursor-bottom-')) { next_cursor = entry.content?.value; continue; }
        if (entry.entryId?.startsWith('cursor-top-')) continue;
        const ic = entry.content?.itemContent;
        if (!ic || ic.__typename !== 'TimelineNotification') continue;
        const icon = ic.notification_icon || '';
        const ntype = iconMap[icon] || ic.clientEventInfo?.element || icon.replace('_icon','');
        const users = (ic.rich_message?.entities || [])
          .filter(e => e.ref?.type === 'TimelineRichTextUser')
          .map(e => { const u = e.ref?.user_results?.result; return u?.legacy?.screen_name || u?.core?.screen_name; })
          .filter(Boolean);
        items.push({type: ntype, users, message: ic.rich_message?.text || '', url: ic.notification_url?.url || '', id: ic.id});
      }
    }
    return {items, next_cursor};
  }

  // Helper: fetch mentions/replies
  async function fetchMentions(cursor) {
    const variables = {timeline_type: 'Mentions', count};
    if (cursor) variables.cursor = cursor;
    const url = '/i/api/graphql/3Jx0YXHGICZsBxDlRrfQnw/NotificationsTimeline?variables=' + encodeURIComponent(JSON.stringify(variables)) + '&features=' + encodeURIComponent(features);
    const resp = await fetch(url, {headers: _h, credentials: 'include'});
    if (!resp.ok) return {items: [], next_cursor: null, error: 'HTTP ' + resp.status};
    const d = await resp.json();
    const instructions = d.data?.viewer_v2?.user_results?.result?.notification_timeline?.timeline?.instructions || [];
    const items = [];
    let next_cursor = null;
    for (const inst of instructions) {
      if (inst.type !== 'TimelineAddEntries') continue;
      for (const entry of (inst.entries || [])) {
        if (entry.entryId?.startsWith('cursor-bottom-')) { next_cursor = entry.content?.value; continue; }
        if (entry.entryId?.startsWith('cursor-top-')) continue;
        // Mentions are tweet objects, not TimelineNotification
        const r = entry.content?.itemContent?.tweet_results?.result;
        if (!r) continue;
        const tw = r.tweet || r;
        const l = tw.legacy || {};
        if (!tw.rest_id) continue;
        const u = tw.core?.user_results?.result;
        const nt = tw.note_tweet?.note_tweet_results?.result?.text;
        const screenName = u?.legacy?.screen_name || u?.core?.screen_name;
        items.push({
          type: l.in_reply_to_status_id_str ? 'reply' : 'mention',
          id: tw.rest_id,
          author: screenName,
          text: nt || l.full_text || '',
          url: 'https://x.com/' + (screenName || '_') + '/status/' + tw.rest_id,
          in_reply_to: l.in_reply_to_status_id_str || undefined,
          created_at: l.created_at
        });
      }
    }
    return {items, next_cursor};
  }

  // Dispatch based on type
  if (type === 'mentions') {
    const r = await fetchMentions(args.cursor);
    if (r.error) return {error: r.error, hint: 'queryId may have changed'};
    const result = {type: 'mentions', count: r.items.length, notifications: r.items};
    if (r.next_cursor) result.next_cursor = r.next_cursor;
    return result;
  }

  if (type === 'likes' || type === 'retweets') {
    const r = await fetchEngagement(args.cursor);
    if (r.error) return {error: r.error, hint: 'queryId may have changed'};
    const filtered = r.items.filter(n => n.type === (type === 'likes' ? 'like' : 'retweet'));
    const result = {type, count: filtered.length, notifications: filtered};
    if (r.next_cursor) result.next_cursor = r.next_cursor;
    return result;
  }

  // type === 'all': fetch both engagement and mentions
  const [eng, men] = await Promise.all([
    fetchEngagement(args.cursor),
    fetchMentions(args.cursor)
  ]);

  if (eng.error && men.error) return {error: eng.error + '; ' + men.error, hint: 'queryId may have changed'};

  const result = {
    type: 'all',
    engagement: {count: eng.items.length, notifications: eng.items},
    mentions: {count: men.items.length, notifications: men.items},
    total: eng.items.length + men.items.length
  };
  if (eng.next_cursor) result.engagement_cursor = eng.next_cursor;
  if (men.next_cursor) result.mentions_cursor = men.next_cursor;
  return result;
}
