/* @meta
{
  "name": "xiaoyuzhoufm/episode",
  "description": "获取小宇宙单集详情（播放数、评论数、完整 shownotes、嘉宾、链接）",
  "domain": "www.xiaoyuzhoufm.com",
  "args": {
    "eid": {"required": true, "description": "Episode ID (URL 中的 ID)"}
  },
  "readOnly": true,
  "example": "bb-browser site xiaoyuzhoufm/episode 69ba2e32f8b8079bfaef73e5"
}
*/

async function(args) {
  if (!args.eid) return {error: 'Missing argument: eid'};

  // 先从任意小宇宙页面拿 buildId
  var indexResp = await fetch('https://www.xiaoyuzhoufm.com/', {credentials: 'include'});
  if (!indexResp.ok) return {error: 'Cannot fetch index: HTTP ' + indexResp.status};
  var indexHtml = await indexResp.text();
  var buildMatch = indexHtml.match(/"buildId":"([^"]+)"/);
  if (!buildMatch) return {error: 'Cannot find buildId'};
  var buildId = buildMatch[1];

  // 调 _next/data API
  var apiUrl = 'https://www.xiaoyuzhoufm.com/_next/data/' + buildId + '/episode/' + args.eid + '.json?id=' + args.eid;
  var resp = await fetch(apiUrl, {credentials: 'include'});
  if (!resp.ok) return {error: 'API HTTP ' + resp.status};
  var data = await resp.json();
  var ep = data.pageProps && data.pageProps.episode;
  if (!ep) return {error: 'No episode data'};

  // 解析 shownotes HTML
  var shownotes = '';
  var links = [];
  var guests = [];
  if (ep.shownotes) {
    var doc = new DOMParser().parseFromString(ep.shownotes, 'text/html');
    shownotes = doc.body.textContent.trim();

    // 提取所有链接
    var anchors = doc.querySelectorAll('a[href], a[data-url]');
    for (var i = 0; i < anchors.length; i++) {
      var href = anchors[i].getAttribute('href') || anchors[i].getAttribute('data-url') || '';
      var text = anchors[i].textContent.trim();
      if (href && href.indexOf('http') === 0) {
        links.push({text: text, url: href});
      }
    }

    // 尝试提取嘉宾（常见格式："本期嘉宾：" 后面的内容）
    var guestMatch = shownotes.match(/嘉宾[：:]\s*([\s\S]*?)(?:本期|Shownotes|时间线|$)/i);
    if (guestMatch) {
      var guestLines = guestMatch[1].split('\n').filter(function(l) { return l.trim().length > 2; });
      guests = guestLines.slice(0, 5).map(function(l) { return l.trim(); });
    }
  }

  // 播客信息
  var podcastInfo = ep.podcast || {};

  return {
    eid: args.eid,
    title: ep.title,
    podcastTitle: podcastInfo.title || null,
    podcastPid: podcastInfo.pid || null,
    playCount: ep.playCount || 0,
    commentCount: ep.commentCount || 0,
    favoriteCount: ep.favoriteCount || 0,
    duration: ep.duration || 0,
    durationMin: Math.round((ep.duration || 0) / 60),
    pubDate: ep.pubDate,
    guests: guests,
    links: links,
    shownotes: shownotes.substring(0, 3000),
    url: 'https://www.xiaoyuzhoufm.com/episode/' + args.eid
  };
}
