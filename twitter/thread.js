/* @meta
{
  "name": "twitter/thread",
  "description": "获取推文对话线程（原文 + 所有回复）",
  "domain": "x.com",
  "args": {
    "tweet_id": {"required": true, "description": "Tweet ID (numeric) or full URL"}
  },
  "capabilities": ["network"],
  "readOnly": true,
  "example": "bb-browser site twitter/thread 2032478407146311850"
}
*/

async function(args) {
  if (!args.tweet_id) return {error: 'Missing argument: tweet_id', hint: 'Provide a tweet ID or URL'};
  const ct0 = document.cookie.split(';').map(c=>c.trim()).find(c=>c.startsWith('ct0='))?.split('=')[1];
  if (!ct0) return {error: 'No ct0 cookie', hint: 'Not logged into x.com'};
  const bearer = decodeURIComponent('AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA');
  const _h = {'Authorization':'Bearer '+bearer, 'X-Csrf-Token':ct0, 'X-Twitter-Auth-Type':'OAuth2Session', 'X-Twitter-Active-User':'yes'};

  let tweetId = args.tweet_id;
  const urlMatch = tweetId.match(/\/status\/(\d+)/);
  if (urlMatch) tweetId = urlMatch[1];

  const features = JSON.stringify({
    responsive_web_graphql_exclude_directive_enabled: true, verified_phone_label_enabled: false,
    creator_subscriptions_tweet_preview_api_enabled: true, responsive_web_graphql_timeline_navigation_enabled: true,
    responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
    longform_notetweets_consumption_enabled: true, longform_notetweets_rich_text_read_enabled: true,
    longform_notetweets_inline_media_enabled: true, freedom_of_speech_not_reach_fetch_enabled: true
  });
  const fieldToggles = JSON.stringify({withArticleRichContentState: true, withArticlePlainText: false});
  const tweetDetailQueryId = findGraphQLQueryId('TweetDetail', 'nBS-WpgA6ZG0CyNHD517JQ');

  let tweets = [], seen = new Set(), cursor = null, maxPages = 5;

  function extractTweet(r) {
    if (!r) return;
    const tw = r.tweet || r; const l = tw.legacy || {};
    if (!tw.rest_id || seen.has(tw.rest_id)) return;
    seen.add(tw.rest_id);
    const u = tw.core?.user_results?.result;
    const nt = tw.note_tweet?.note_tweet_results?.result?.text;
    const screenName = u?.legacy?.screen_name || u?.core?.screen_name;
    const rawViewCount = tw.views?.count;
    const viewCount = rawViewCount == null ? null : Number(rawViewCount);
    tweets.push({id: tw.rest_id, author: screenName, text: nt || l.full_text || '',
      url: 'https://x.com/' + (screenName || '_') + '/status/' + tw.rest_id,
      likes: l.favorite_count, retweets: l.retweet_count,
      replies: l.reply_count ?? null, bookmarks: l.bookmark_count ?? null,
      views: Number.isFinite(viewCount) ? viewCount : null,
      in_reply_to: l.in_reply_to_status_id_str, created_at: l.created_at});
  }

  for (let page = 0; page < maxPages; page++) {
    const vars = {
      focalTweetId: tweetId, referrer: 'tweet', with_rux_injections: false,
      includePromotedContent: false, rankingMode: 'Recency',
      withCommunity: true, withQuickPromoteEligibilityTweetFields: true,
      withBirdwatchNotes: true, withVoice: true
    };
    if (cursor) vars.cursor = cursor;

    const url = '/i/api/graphql/' + tweetDetailQueryId + '/TweetDetail?variables=' + encodeURIComponent(JSON.stringify(vars)) + '&features=' + encodeURIComponent(features) + '&fieldToggles=' + encodeURIComponent(fieldToggles);
    const resp = await fetch(url, {headers: _h, credentials: 'include'});
    if (!resp.ok) return {error: 'HTTP ' + resp.status, hint: 'Tweet may not exist or queryId expired'};
    const d = await resp.json();

    const instructions = d.data?.threaded_conversation_with_injections_v2?.instructions || d.data?.tweetResult?.result?.timeline?.instructions || [];
    let nextCursor = null;

    for (const inst of instructions) {
      for (const entry of (inst.entries || [])) {
        // Extract cursor for pagination
        if (entry.content?.entryType === 'TimelineTimelineCursor' || entry.content?.__typename === 'TimelineTimelineCursor') {
          if (entry.content.cursorType === 'Bottom' || entry.content.cursorType === 'ShowMore') {
            nextCursor = entry.content.value;
          }
          continue;
        }
        // Also check entryId for cursor
        if (entry.entryId?.startsWith('cursor-bottom-') || entry.entryId?.startsWith('cursor-showMore-')) {
          const cv = entry.content?.itemContent?.value || entry.content?.value;
          if (cv) nextCursor = cv;
          continue;
        }

        extractTweet(entry.content?.itemContent?.tweet_results?.result);
        for (const item of (entry.content?.items || [])) {
          extractTweet(item.item?.itemContent?.tweet_results?.result);
        }
      }
    }

    if (!nextCursor || nextCursor === cursor) break;
    cursor = nextCursor;
  }

  return {tweet_id: tweetId, count: tweets.length, tweets};
}
