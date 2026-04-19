/* @meta
{
  "name": "smzdm/search",
  "description": "什么值得买搜索好价",
  "domain": "search.smzdm.com",
  "args": {
    "keyword": {"required": true, "description": "Search keyword (e.g. 耳机)"},
    "count": {"required": false, "description": "Max results to return (default: 20)"}
  },
  "capabilities": ["network"],
  "readOnly": true,
  "example": "bb-browser site smzdm/search \"耳机\""
}
*/

async function(args) {
  if (!args.keyword) return {error: 'Missing argument: keyword'};
  const keyword = args.keyword;
  const maxCount = parseInt(args.count) || 20;
  const q = encodeURIComponent(keyword);

  // Use youhui channel for deal items with prices; fall back to home channel
  var html = '';
  var channel = 'youhui';
  var resp = await fetch('/ajax/?c=youhui&s=' + q + '&p=1&v=b', {
    credentials: 'include',
    headers: {'X-Requested-With': 'XMLHttpRequest'}
  });

  if (resp.ok) {
    html = await resp.text();
  }

  // If youhui channel returned no results or failed, try home channel
  if (!html || html.indexOf('feed-row-wide') === -1) {
    channel = 'home';
    resp = await fetch('/ajax/?c=home&s=' + q + '&p=1&v=b', {
      credentials: 'include',
      headers: {'X-Requested-With': 'XMLHttpRequest'}
    });
    if (!resp.ok) return {error: 'HTTP ' + resp.status, hint: 'Navigate to search.smzdm.com first'};
    html = await resp.text();
  }

  // Check for anti-bot page
  if (html.indexOf('probe.js') !== -1 && html.indexOf('feed-row-wide') === -1) {
    return {error: 'Anti-bot protection triggered', hint: 'Open search.smzdm.com in bb-browser first to pass verification'};
  }

  var parser = new DOMParser();
  var doc = parser.parseFromString(html, 'text/html');
  var items = doc.querySelectorAll('li.feed-row-wide');
  var results = [];

  items.forEach(function(li, i) {
    if (results.length >= maxCount) return;

    // Title: h5.feed-block-title for deals, h5.feed-shaiwu-title or h5.feed-zhuanzai-title for articles
    var titleEl = li.querySelector('h5.feed-block-title > a')
               || li.querySelector('h5.feed-shaiwu-title > a')
               || li.querySelector('h5.feed-zhuanzai-title > a')
               || li.querySelector('h5 > a');
    if (!titleEl) return;

    var title = (titleEl.getAttribute('title') || titleEl.textContent || '').trim();
    var url = titleEl.getAttribute('href') || '';

    // Price: div.z-highlight
    var priceEl = li.querySelector('.z-highlight');
    var price = priceEl ? priceEl.textContent.trim() : '';

    // Description: div.feed-block-descripe-top (deals) or div.feed-shaiwu-descripe (articles)
    var descEl = li.querySelector('.feed-block-descripe-top')
              || li.querySelector('.feed-shaiwu-descripe')
              || li.querySelector('.feed-block-descripe');
    var description = descEl ? descEl.textContent.trim().substring(0, 300) : '';

    // Mall/source: span.feed-block-extras contains date and mall name
    var mall = '';
    var footR = li.querySelector('.z-feed-foot-r');
    if (footR) {
      var extrasSpan = footR.querySelector('.feed-block-extras');
      if (extrasSpan) {
        var mallSpan = extrasSpan.querySelector('span');
        if (mallSpan) {
          mall = mallSpan.textContent.trim();
        }
      }
    }

    // Also try to extract mall from the go-buy link's onclick data
    if (!mall) {
      var buyLink = li.querySelector('a.z-btn-red');
      if (buyLink) {
        var onclick = buyLink.getAttribute('onclick') || '';
        var mallMatch = onclick.match(/'mall_name':'([^']+)'/);
        if (mallMatch) mall = mallMatch[1];
      }
    }

    // Tags
    var tags = [];
    li.querySelectorAll('.feed-block-tags > a').forEach(function(a) {
      var t = a.textContent.trim();
      if (t && t !== 'javascript:;') tags.push(t);
    });

    // Type marker: 好价, 视频, 全网内容, etc.
    var typeEl = li.querySelector('.search-faxian-mark')
              || li.querySelector('.search-shaiwu-mark')
              || li.querySelector('.search-zhuanzai-mark');
    var type = typeEl ? typeEl.textContent.trim() : '';

    // Timestamp from feed-block-extras text
    var timestamp = '';
    var extrasEl = li.querySelector('.feed-block-extras');
    if (extrasEl) {
      // Extract date part (e.g., "03-14 11:13")
      var extrasText = extrasEl.childNodes[0];
      if (extrasText && extrasText.nodeType === 3) {
        timestamp = extrasText.textContent.trim();
      }
    }

    // Comments count
    var commentEl = li.querySelector('.feed-btn-comment');
    var comments = commentEl ? parseInt(commentEl.textContent.trim()) || 0 : 0;

    var result = {rank: results.length + 1, title: title, url: url};
    if (price) result.price = price;
    if (description) result.description = description;
    if (mall) result.mall = mall;
    if (type) result.type = type;
    if (tags.length) result.tags = tags;
    if (timestamp) result.timestamp = timestamp;
    if (comments) result.comments = comments;

    results.push(result);
  });

  return {keyword: keyword, channel: channel, count: results.length, results: results};
}
