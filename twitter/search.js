/* @meta
{
  "name": "twitter/search",
  "description": "搜索推文",
  "domain": "x.com",
  "args": {
    "query": {"required": true, "description": "Search query"},
    "count": {"required": false, "description": "Number of results (default 20, max 50)"},
    "type": {"required": false, "description": "Result type: latest (default) or top"}
  },
  "capabilities": ["network"],
  "readOnly": true,
  "example": "bb-browser site twitter/search \"claude code\""
}
*/

async function(args) {
  if (!args.query) return {error: 'Missing argument: query', hint: 'Provide a search query'};
  const ct0 = document.cookie.split(';').map(c=>c.trim()).find(c=>c.startsWith('ct0='))?.split('=')[1];
  if (!ct0) return {error: 'No ct0 cookie', hint: 'Please log in to https://x.com first.'};

  // x-client-transaction-id 生成逻辑在 X 前端经常变动，失败时降级为无该头请求
  let txId = null;
  try {
    let __webpack_require__;
    const chunkId = '__bb_s_' + Date.now();
    if (window.webpackChunk_twitter_responsive_web?.push) {
      window.webpackChunk_twitter_responsive_web.push([[chunkId], {}, (req) => { __webpack_require__ = req; }]);
      const txMod = __webpack_require__?.(83914);
      const genTxId = txMod?.jJ;
      if (typeof genTxId === 'function') {
        txId = await genTxId('x.com', '/i/api/graphql/oKkjeoNFNQN7IeK7AHYc0A/SearchTimeline', 'GET');
      }
    }
  } catch (_) {}

  const bearer = 'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';
  const path = '/i/api/graphql/oKkjeoNFNQN7IeK7AHYc0A/SearchTimeline';

  const _h = {
    'Authorization': 'Bearer ' + bearer, 'X-Csrf-Token': ct0,
    'X-Twitter-Auth-Type': 'OAuth2Session', 'X-Twitter-Active-User': 'yes'
  };
  if (txId) _h['X-Client-Transaction-Id'] = txId;

  const count = Math.min(parseInt(args.count) || 20, 50);
  const product = (args.type === 'top') ? 'Top' : 'Latest';
  const variables = JSON.stringify({
    rawQuery: args.query, count, querySource: 'typed_query', product
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
  const normalizeGraphql = (d) => {
    const instructions = d.data?.search_by_raw_query?.search_timeline?.timeline?.instructions || [];
    const tweets = [];
    for (const inst of instructions) {
      for (const entry of (inst.entries || [])) {
        const r = entry.content?.itemContent?.tweet_results?.result;
        if (!r) continue;
        const tw = r.tweet || r;
        const l = tw.legacy || {};
        if (!tw.rest_id) continue;
        const u = tw.core?.user_results?.result;
        const nt = tw.note_tweet?.note_tweet_results?.result?.text;
        const screenName = u?.legacy?.screen_name || u?.core?.screen_name;
        tweets.push({id: tw.rest_id, author: screenName,
          name: u?.legacy?.name || u?.core?.name,
          url: 'https://x.com/' + (screenName || '_') + '/status/' + tw.rest_id,
          text: nt || l.full_text || '', likes: l.favorite_count, retweets: l.retweet_count,
          in_reply_to: l.in_reply_to_status_id_str || undefined, created_at: l.created_at});
      }
    }
    return tweets;
  };

  const normalizeAdaptive = (d) => {
    const users = d.globalObjects?.users || {};
    const tweetsObj = d.globalObjects?.tweets || {};
    const tweets = [];
    for (const id of Object.keys(tweetsObj)) {
      const t = tweetsObj[id] || {};
      const u = users[t.user_id_str] || {};
      tweets.push({
        id: t.id_str || id,
        author: u.screen_name,
        name: u.name,
        url: 'https://x.com/' + (u.screen_name || '_') + '/status/' + (t.id_str || id),
        text: t.full_text || t.text || '',
        likes: t.favorite_count,
        retweets: t.retweet_count,
        in_reply_to: t.in_reply_to_status_id_str || undefined,
        created_at: t.created_at
      });
    }
    tweets.sort((a, b) => (new Date(b.created_at || 0)) - (new Date(a.created_at || 0)));
    return tweets.slice(0, count);
  };

  const safeJson = async (r) => {
    const t = await r.text();
    if (!t) return null;
    try { return JSON.parse(t); } catch { return null; }
  };

  const scrapeSearchPage = async () => {
    const searchUrl = 'https://x.com/search?q=' + encodeURIComponent(args.query) + '&src=typed_query&f=' + ((args.type === 'top') ? 'top' : 'live');
    if (!location.href.includes('/search?')) {
      return { __needOpenSearch: searchUrl };
    }
    await new Promise(r => setTimeout(r, 1200));

    const rows = [];
    const articles = Array.from(document.querySelectorAll('article')).slice(0, count);
    for (const a of articles) {
      const textNode = a.querySelector('[data-testid="tweetText"]');
      const link = a.querySelector('a[href*="/status/"]');
      const userLink = a.querySelector('a[href^="/"][role="link"]');
      const url = link ? ('https://x.com' + link.getAttribute('href')) : undefined;
      const author = userLink ? (userLink.getAttribute('href') || '').replace(/^\//, '').split('/')[0] : undefined;
      const text = textNode ? textNode.innerText.trim() : '';
      if (!text && !url) continue;
      const id = (url && url.split('/status/')[1]) ? url.split('/status/')[1].split('?')[0] : undefined;
      rows.push({ id, author, url, text });
    }
    return rows;
  };

  const url = path + '?variables=' + encodeURIComponent(variables) + '&features=' + encodeURIComponent(features);
  let resp = await fetch(url, {headers: _h, credentials: 'include'});
  let tweets = [];

  if (resp.ok) {
    const d = await safeJson(resp);
    if (d) tweets = normalizeGraphql(d);
  } else if (resp.status === 404) {
    // fallback: 旧版内部搜索接口
    const adaptiveUrl = '/i/api/2/search/adaptive.json?q=' + encodeURIComponent(args.query)
      + '&count=' + count
      + '&tweet_mode=extended'
      + '&result_filter=tweets'
      + '&query_source=typed_query';
    const resp2 = await fetch(adaptiveUrl, {headers: _h, credentials: 'include'});
    if (resp2.ok) {
      const d2 = await safeJson(resp2);
      if (d2) tweets = normalizeAdaptive(d2);
    }
  }

  // 最终降级：直接抓搜索页 DOM
  if (!tweets || tweets.length === 0) {
    const fallback = await scrapeSearchPage();
    if (fallback?.__needOpenSearch) {
      return {error: 'Search page not open', hint: 'Open and retry: ' + fallback.__needOpenSearch};
    }
    tweets = fallback;
  }

  return {query: args.query, product, count: tweets.length, tweets, source: (tweets[0]?.likes !== undefined ? 'api' : 'dom')};
}
