/* @meta
{
  "name": "sogou/weixin",
  "description": "搜狗微信搜索 (WeChat article search: title, snippet, account)",
  "domain": "weixin.sogou.com",
  "args": {
    "query": {"required": true, "description": "Search query"},
    "page": {"required": false, "description": "Page number (default 1)"}
  },
  "readOnly": true,
  "example": "bb-browser site sogou/weixin \"AI agent\""
}
*/

async function(args) {
  if (!args.query) return {error: 'Missing argument: query'};

  const query = encodeURIComponent(args.query);
  const page = parseInt(args.page) || 1;
  const url = 'https://weixin.sogou.com/weixin?type=2&query=' + query + '&page=' + page;

  const resp = await fetch(url, {credentials: 'include'});
  if (!resp.ok) return {error: 'HTTP ' + resp.status, hint: 'Make sure a weixin.sogou.com tab is open.'};

  const html = await resp.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // Check for anti-bot / verification page
  if (html.includes('用户您好，您的访问过于频繁') || html.includes('请输入验证码')) {
    return {error: 'Rate limited or CAPTCHA required', hint: 'Open weixin.sogou.com in the browser and complete the verification.'};
  }

  const items = doc.querySelectorAll('.news-list ul li, .news-box ul li, div[id^="sogou_vr_"] ul li');
  const results = [];

  items.forEach(function(li, i) {
    // Title & link
    const titleEl = li.querySelector('h3 a') || li.querySelector('.txt-box h3 a') || li.querySelector('a[target="_blank"]');
    const title = titleEl ? titleEl.textContent.trim() : '';
    const articleUrl = titleEl ? titleEl.getAttribute('href') : '';

    // WeChat account name
    const accountEl = li.querySelector('.s-p a, .account, .s2, a[data-z]');
    const account = accountEl ? accountEl.textContent.trim() : '';

    // Snippet / abstract
    const snippetEl = li.querySelector('.txt-info, .s-p:not(:last-child), p.txt-info');
    const snippet = snippetEl ? snippetEl.textContent.trim() : '';

    // Timestamp
    const timeEl = li.querySelector('.s2, .s-p .tim, span[class*="time"], script');
    let timeStr = '';
    if (timeEl && timeEl.tagName === 'SCRIPT') {
      // Sogou embeds timestamps via document.write in script tags
      const m = timeEl.textContent.match(/timeConvert\('(\d+)'\)/);
      if (m) timeStr = new Date(parseInt(m[1]) * 1000).toISOString();
    } else if (timeEl) {
      timeStr = timeEl.textContent.trim();
    }

    // Image thumbnail
    const imgEl = li.querySelector('img[src], img[data-src]');
    const thumbnail = imgEl ? (imgEl.getAttribute('src') || imgEl.getAttribute('data-src')) : '';

    if (title) {
      results.push({
        rank: i + 1,
        title: title,
        url: articleUrl ? (articleUrl.startsWith('http') ? articleUrl : 'https://weixin.sogou.com' + articleUrl) : '',
        account: account,
        snippet: snippet,
        time: timeStr,
        thumbnail: thumbnail
      });
    }
  });

  // Also try extracting from the newer layout if no results found
  if (results.length === 0) {
    const vrItems = doc.querySelectorAll('.vrwrap, .vr_item, [class*="result"]');
    vrItems.forEach(function(el, i) {
      const titleEl = el.querySelector('h3 a, h4 a, a.title');
      const title = titleEl ? titleEl.textContent.trim() : '';
      const articleUrl = titleEl ? titleEl.getAttribute('href') : '';
      const accountEl = el.querySelector('a[data-z], .account, .wx-rb');
      const account = accountEl ? accountEl.textContent.trim() : '';
      const snippetEl = el.querySelector('p, .txt-info, .desc');
      const snippet = snippetEl ? snippetEl.textContent.trim() : '';

      if (title) {
        results.push({
          rank: i + 1,
          title: title,
          url: articleUrl ? (articleUrl.startsWith('http') ? articleUrl : 'https://weixin.sogou.com' + articleUrl) : '',
          account: account,
          snippet: snippet
        });
      }
    });
  }

  // Extract total count if available
  const totalEl = doc.querySelector('.mun, #scd_num, #tool_tip span');
  const totalText = totalEl ? totalEl.textContent.trim() : '';

  return {
    query: args.query,
    page: page,
    count: results.length,
    total: totalText,
    results: results
  };
}
