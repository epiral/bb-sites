/* @meta
{
  "name": "imdb/get-rating",
  "description": "IMDb评分查询 - 查询电影/电视剧评分 (rating: title, rating, voteCount, metascore, genres)",
  "domain": "www.imdb.com",
  "args": {
    "query": {
      "type": "string",
      "required": true,
      "description": "电影/电视剧标题或 IMDb ID (tt-开头)"
    },
    "type": {
      "type": "string",
      "required": false,
      "description": "筛选类型: movie 或 tv (可选)"
    }
  },
  "readOnly": true,
  "tags": ["imdb", "ratings", "movies", "tv", "aws-waf"],
  "example": "bb-browser site imdb/get-rating --query tt1375666"
}
*/

async function(args) {
  const query = (args.query || '').trim();
  if (!query) return {error: '请提供电影/电视剧标题或 IMDb ID'};

  const filterType = (args.type || '').toLowerCase().trim();

  // ── Step 1: Resolve query to IMDb ID ──────────────────────────
  let imdbId = query;

  // If not already a tt-id, search via IMDb API
  if (!/^tt\d+$/i.test(query)) {
    const firstChar = query[0].toLowerCase();
    const searchUrl = `https://v3.sg.media-imdb.com/suggestion/${firstChar}/${encodeURIComponent(query)}.json`;

    let resp;
    try {
      resp = await fetch(searchUrl);
    } catch (e) {
      return {error: '搜索 IMDb 时网络请求失败', detail: e.message, hint: '请检查网络连接'};
    }
    if (!resp.ok) {
      return {error: 'IMDb 搜索服务暂不可用 (HTTP ' + resp.status + ')'};
    }

    let data;
    try {
      data = await resp.json();
    } catch (e) {
      return {error: 'IMDb 搜索结果解析失败', detail: e.message};
    }

    const items = data.d || [];
    if (items.length === 0) {
      return {error: '未找到与 "' + query + '" 相关的电影/电视剧', hint: '请尝试更精确的关键词'};
    }

    // Apply type filter if provided
    let candidates = items;
    if (filterType === 'movie') {
      candidates = items.filter(i => i.qid === 'movie' || i.q === 'feature' || i.q === 'movie');
    } else if (filterType === 'tv') {
      candidates = items.filter(i => i.qid === 'tvSeries' || i.q === 'TV series' || i.q === 'TV mini-series');
    }

    if (candidates.length === 0) {
      return {error: '未找到匹配类型"' + filterType + '"的结果，请检查 type 参数'};
    }

    // Pick the best match: exact title match > prefix match > first result
    const queryLower = query.toLowerCase();
    let best = candidates.find(i => i.l && i.l.toLowerCase() === queryLower);
    if (!best) best = candidates.find(i => i.l && i.l.toLowerCase().startsWith(queryLower));
    if (!best) best = candidates[0];

    imdbId = best.id;
    if (!imdbId) return {error: '无法获取 IMDb ID'};
  }

  // ── Step 2: Fetch title page ──────────────────────────────────
  const titleUrl = 'https://www.imdb.com/title/' + imdbId + '/';

  let pageResp;
  try {
    pageResp = await fetch(titleUrl);
  } catch (e) {
    return {error: '获取页面时网络请求失败', detail: e.message, hint: 'IMDb 可能暂时无法访问'};
  }
  if (!pageResp.ok) {
    return {error: '无法访问 IMDb 页面 (HTTP ' + pageResp.status + ')', hint: '页面可能受到 AWS WAF 保护，请稍后重试'};
  }

  let html;
  try {
    html = await pageResp.text();
  } catch (e) {
    return {error: '读取页面内容失败', detail: e.message};
  }

  if (!html || html.length < 1000) {
    return {error: '页面内容过短', hint: 'IMDb 可能返回了验证页面，请稍后重试'};
  }

  // ── Step 3: Extract data from __NEXT_DATA__ ───────────────────
  const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*type="application\/json"[^>]*>({.*?})<\/script>/s);
  if (!nextDataMatch) {
    return {error: '无法解析 IMDb 页面数据', hint: '页面结构可能已更新，或需要浏览器模式'};
  }

  let pageData;
  try {
    pageData = JSON.parse(nextDataMatch[1]);
  } catch (e) {
    return {error: 'IMDb 页面数据解析失败', detail: e.message};
  }

  const atf = pageData.props?.pageProps?.aboveTheFoldData;
  if (!atf) {
    return {error: 'IMDb 页面缺少核心数据', hint: '页面结构可能已更新'};
  }

  // ── Step 4: Extract specific fields ───────────────────────────
  const title = atf.titleText?.text || '';
  const rating = atf.ratingsSummary?.aggregateRating;
  const voteCount = atf.ratingsSummary?.voteCount;
  const metascore = atf.metacritic?.metascore?.score;
  const genres = (atf.titleGenres?.genres || []).map(g => g.genre?.text || g.text || '').filter(Boolean);
  const plot = atf.plot?.plotText?.plainText || '';
  const year = atf.releaseYear?.year;
  const contentType = atf.titleType?.id || '';
  const certificate = atf.certificate?.rating || '';
  const runtimeSeconds = atf.runtime?.seconds;

  // Nicely format runtime
  let runtimeFormatted = '';
  if (runtimeSeconds) {
    const hours = Math.floor(runtimeSeconds / 3600);
    const minutes = Math.floor((runtimeSeconds % 3600) / 60);
    runtimeFormatted = hours > 0 ? hours + 'h ' + minutes + 'm' : minutes + 'm';
  }

  return {
    query: query,
    title: title,
    year: year,
    type: contentType,
    certificate: certificate,
    rating: rating,
    voteCount: voteCount,
    metascore: metascore,
    genres: genres,
    plot: plot,
    runtime: runtimeFormatted,
    runtimeSeconds: runtimeSeconds,
    url: titleUrl
  };
}
