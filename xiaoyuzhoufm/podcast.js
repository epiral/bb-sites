/* @meta
{
  "name": "xiaoyuzhoufm/podcast",
  "description": "获取小宇宙播客详情（订阅数、集数、每集播放数和评论数）",
  "domain": "www.xiaoyuzhoufm.com",
  "args": {
    "pid": {"required": true, "description": "Podcast ID (URL 中的 ID)"}
  },
  "readOnly": true,
  "example": "bb-browser site xiaoyuzhoufm/podcast 626b46ea9cbbf0451cf5a962"
}
*/

async function(args) {
  if (!args.pid) return {error: 'Missing argument: pid'};

  // Step 1: fetch 播客页面拿 __NEXT_DATA__（含 buildId + 播客基础信息）
  var url = 'https://www.xiaoyuzhoufm.com/podcast/' + args.pid;
  var resp = await fetch(url, {credentials: 'include'});
  if (!resp.ok) return {error: 'HTTP ' + resp.status};
  var html = await resp.text();
  var parser = new DOMParser();
  var doc = parser.parseFromString(html, 'text/html');

  var nextDataEl = doc.querySelector('#__NEXT_DATA__');
  if (!nextDataEl) return {error: 'No __NEXT_DATA__ found'};

  var nextData = JSON.parse(nextDataEl.textContent);
  var podcast = nextData.props && nextData.props.pageProps && nextData.props.pageProps.podcast;
  if (!podcast) return {error: 'No podcast data'};

  var buildId = nextData.buildId;

  // Step 2: 从 HTML 提取 episode IDs + 从 schema.org 拿标题/日期
  var eids = [];
  var eidMatches = html.match(/episode\/([a-f0-9]{24})/g) || [];
  var seen = {};
  for (var i = 0; i < eidMatches.length; i++) {
    var eid = eidMatches[i].replace('episode/', '');
    if (!seen[eid]) { seen[eid] = true; eids.push(eid); }
  }

  // schema.org 拿标题和日期
  var schemaTitles = [];
  var scripts = doc.querySelectorAll('script');
  for (var si = 0; si < scripts.length; si++) {
    var txt = scripts[si].textContent;
    if (txt.indexOf('"@context"') !== -1 && txt.indexOf('workExample') !== -1) {
      try {
        var schema = JSON.parse(txt);
        schemaTitles = (schema.workExample || []).map(function(w) {
          return { title: w.name, date: w.datePublished ? w.datePublished.substring(0, 10) : null,
                   description: (w.description || '').substring(0, 200) };
        });
      } catch(e) {}
      break;
    }
  }

  // 合并 eid + schema 数据（按顺序对应）
  var episodeList = [];
  for (var j = 0; j < eids.length; j++) {
    var meta = schemaTitles[j] || {};
    episodeList.push({
      eid: eids[j],
      title: meta.title || null,
      date: meta.date || null,
      description: meta.description || null,
      playCount: null,
      commentCount: null,
      favoriteCount: null
    });
  }

  // Step 3: 用 _next/data API 批量拿每集的 playCount / commentCount / favoriteCount
  if (buildId && episodeList.length > 0) {
    var fetches = episodeList.slice(0, 20).map(function(ep) {
      if (!ep.eid) return Promise.resolve(null);
      var apiUrl = 'https://www.xiaoyuzhoufm.com/_next/data/' + buildId + '/episode/' + ep.eid + '.json?id=' + ep.eid;
      return fetch(apiUrl, {credentials: 'include'})
        .then(function(r) { return r.ok ? r.json() : null; })
        .catch(function() { return null; });
    });

    var results = await Promise.all(fetches);
    for (var k = 0; k < results.length; k++) {
      if (results[k] && results[k].pageProps && results[k].pageProps.episode) {
        var epData = results[k].pageProps.episode;
        episodeList[k].playCount = epData.playCount || 0;
        episodeList[k].commentCount = epData.commentCount || 0;
        episodeList[k].favoriteCount = epData.favoriteCount || 0;
        // shownotes: HTML → 纯文本，保留链接
        if (epData.shownotes) {
          var tmp = new DOMParser().parseFromString(epData.shownotes, 'text/html');
          // 提取所有链接
          var links = [];
          var anchors = tmp.querySelectorAll('a[href]');
          for (var li = 0; li < anchors.length; li++) {
            var href = anchors[li].getAttribute('href') || anchors[li].getAttribute('data-url') || '';
            if (href && href.indexOf('http') === 0) links.push(href);
          }
          episodeList[k].shownotes = tmp.body.textContent.trim().substring(0, 2000);
          episodeList[k].links = links;
        }
      }
    }
  }

  return {
    pid: args.pid,
    title: podcast.title,
    author: podcast.author,
    description: (podcast.description || '').substring(0, 500),
    subscriptionCount: podcast.subscriptionCount,
    episodeCount: podcast.episodeCount,
    latestEpisodePubDate: podcast.latestEpisodePubDate,
    url: url,
    episodes: episodeList.slice(0, 20)
  };
}
