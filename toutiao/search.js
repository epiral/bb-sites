/* @meta
{
  "name": "toutiao/search",
  "description": "今日头条搜索 (Toutiao search: title, snippet, source)",
  "domain": "so.toutiao.com",
  "args": {
    "query": {"required": true, "description": "搜索关键词"},
    "count": {"required": false, "description": "返回结果数量 (默认 10, 最多 20)"}
  },
  "readOnly": true,
  "example": "bb-browser site toutiao/search AI"
}
*/

async function(args) {
  if (!args.query) return {error: 'Missing argument: query', hint: 'Provide a search keyword'};
  const count = Math.min(parseInt(args.count) || 10, 20);

  const url = 'https://so.toutiao.com/search?keyword=' + encodeURIComponent(args.query) + '&pd=information&dvpf=pc';
  const resp = await fetch(url, {credentials: 'include'});
  if (!resp.ok) return {error: 'HTTP ' + resp.status, hint: 'Open so.toutiao.com in bb-browser first'};

  const html = await resp.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  const results = [];

  // Helper: extract clean article URL from jump redirect chain
  function extractArticleUrl(href) {
    if (!href) return '';
    try {
      // Decode nested jump URLs to find the real toutiao article URL
      let decoded = href;
      for (let i = 0; i < 5; i++) {
        const match = decoded.match(/toutiao\.com(?:%2F|\/)+a?(\d{15,})/);
        if (match) return 'https://www.toutiao.com/article/' + match[1] + '/';
        const groupMatch = decoded.match(/group(?:%2F|\/)(\d{15,})/);
        if (groupMatch) return 'https://www.toutiao.com/article/' + groupMatch[1] + '/';
        decoded = decodeURIComponent(decoded);
      }
    } catch (e) {}
    return href;
  }

  // Strategy 1: SSR HTML uses cs-card containers
  const cards = doc.querySelectorAll('.cs-card');
  for (const card of cards) {
    const titleLink = card.querySelector('a[href*="search/jump"]');
    if (!titleLink) continue;

    const title = (titleLink.textContent || '').trim();
    if (!title || title.length < 2) continue;
    // Skip non-result links like "去西瓜搜" / "去抖音搜"
    if (title.includes('去西瓜搜') || title.includes('去抖音搜')) continue;

    const articleUrl = extractArticleUrl(titleLink.getAttribute('href') || '');

    // Extract snippet & source & time from card text
    const fullText = (card.textContent || '').trim();
    // Remove the title (may appear twice) to get the rest
    let rest = fullText;
    const titleIdx = rest.indexOf(title);
    if (titleIdx >= 0) rest = rest.substring(titleIdx + title.length);
    // Remove second occurrence of title if present
    const titleIdx2 = rest.indexOf(title);
    if (titleIdx2 >= 0) rest = rest.substring(titleIdx2 + title.length);
    rest = rest.trim();

    let snippet = '';
    let source = '';
    let time = '';

    // Remove trailing comment count like "1评论" or "23评论" first
    rest = rest.replace(/\d+评论/g, '').trim();

    // Extract time from the tail first
    // Time patterns: "3天前", "12小时前", "5分钟前", "前天17:23", "昨天08:00", "2024-01-01"
    // The number-based patterns (N天前 etc.) must NOT be preceded by a digit
    const timeMatch = rest.match(/((?<=[^\d])|^)(\d{1,2}(?:小时|分钟|天)前|前天[\d:]*|昨天[\d:]*|\d{4}[-/.]\d{2}[-/.]\d{2}.*)$/);
    if (timeMatch) {
      time = timeMatch[2] ? timeMatch[2].trim() : timeMatch[0].trim();
      rest = rest.substring(0, rest.length - timeMatch[0].length).trim();
    }

    // Source is the short text at the end (author/media name, typically 2-20 chars)
    // Pattern: "...snippet content...SourceName"
    const sourceMatch = rest.match(/^([\s\S]+?)([\u4e00-\u9fa5A-Za-z][\u4e00-\u9fa5A-Za-z0-9_\s]{1,19})$/);
    if (sourceMatch && sourceMatch[1].length > 10) {
      snippet = sourceMatch[1].trim().substring(0, 300);
      source = sourceMatch[2].trim();
    } else {
      snippet = rest.substring(0, 300);
    }

    results.push({title, snippet, source, time, url: articleUrl});
    if (results.length >= count) break;
  }

  // Strategy 2: Fallback to finding jump links with article IDs
  if (results.length === 0) {
    const links = doc.querySelectorAll('a[href*="search/jump"]');
    for (const link of links) {
      const text = (link.textContent || '').trim();
      if (!text || text.length < 4) continue;
      // Skip navigation/promo links
      if (text.includes('去西瓜搜') || text.includes('去抖音搜') || text.includes('APP')) continue;

      const href = link.getAttribute('href') || '';
      // Only include links that point to actual articles
      if (!href.match(/toutiao\.com|group|a\d{10,}/)) continue;

      const articleUrl = extractArticleUrl(href);
      if (results.some(r => r.title === text)) continue;

      // Try to get snippet from sibling/parent context
      let snippet = '';
      const container = link.closest('[class*="card"]') || link.parentElement?.parentElement;
      if (container) {
        const containerText = (container.textContent || '').trim();
        const afterTitle = containerText.indexOf(text);
        if (afterTitle >= 0) {
          const rest = containerText.substring(afterTitle + text.length).trim();
          if (rest.length > 10) snippet = rest.substring(0, 300);
        }
      }

      results.push({title: text, snippet, source: '', time: '', url: articleUrl});
      if (results.length >= count) break;
    }
  }

  if (results.length === 0) {
    return {
      error: 'No results found',
      hint: 'Toutiao may require login or has anti-scraping protection. Try: 1) Open so.toutiao.com in bb-browser first, 2) Log in to toutiao, 3) Use toutiao/hot instead',
      query: args.query
    };
  }

  return {
    query: args.query,
    count: results.length,
    results
  };
}
