/* @meta
{
  "name": "wsj/news",
  "description": "WSJ article full text by URL",
  "domain": "www.wsj.com",
  "args": {
    "url": {"required": true, "description": "WSJ news URL"}
  },
  "readOnly": true,
  "example": "bb-browser site wsj/news https://www.wsj.com/tech/ai/example-article-id"
}
*/

async function(args) {
  const toWsjPath = url => {
    try {
      const u = new URL(url, 'https://www.wsj.com');
      if (!/(^|\.)wsj\.com$/.test(u.hostname)) return '';
      return u.pathname + u.search;
    } catch (e) {
      return '';
    }
  };
  const readNextData = doc => {
    try {
      const el = doc.querySelector('#__NEXT_DATA__');
      return el ? JSON.parse(el.textContent) : null;
    } catch (e) {
      return null;
    }
  };
  const extractText = value => {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return value.map(extractText).join('');
    if (typeof value === 'object') {
      if (typeof value.text === 'string') return value.text;
      if (value.flattened) return extractText(value.flattened);
      if (value.nested) return extractText(value.nested);
      if (value.content) return extractText(value.content);
      if (value.textAndDecorations) return extractText(value.textAndDecorations);
    }
    return '';
  };
  const getText = value => extractText(value).replace(/\s+/g, ' ').trim();
  const extractBody = blocks => {
    const out = [];
    for (const block of blocks || []) {
      if (!block || block.type !== 'paragraph') continue;
      const value = extractText(block.content || block.textAndDecorations || block).replace(/\s+/g, ' ').trim();
      if (value) out.push(value);
    }
    return out;
  };
  const getAltSummary = article => {
    for (const item of article.flattenedAltSummaries || []) {
      const value = getText(item?.descriptions?.[0]?.content);
      if (value) return value.replace(/^EXCLUSIVE:\s*/i, '');
    }
    return '';
  };
  const normalizeAuthors = value => {
    const seen = new Set();
    return (Array.isArray(value) ? value : [])
      .map(x => x?.name || x?.byline || x?.text || x?.content?.byline || '')
      .filter(name => name && name.toLowerCase() !== 'by')
      .filter(name => !seen.has(name) && seen.add(name));
  };
  const cleanUrl = url => {
    if (!url) return '';
    try {
      const u = new URL(url, 'https://www.wsj.com');
      return u.origin + u.pathname;
    } catch (e) {
      return url;
    }
  };
  const text = el => (el?.textContent || '').replace(/\s+/g, ' ').trim();
  const extractDomAuthors = doc => Array.from(new Set(Array.from(doc.querySelectorAll('[rel="author"], [class*="byline"] a, [class*="Byline"] a')).map(text).filter(Boolean)));

  const inputUrl = args.url || args._ || args[0];
  if (!inputUrl) return {error: 'Missing argument: url', hint: 'Provide a WSJ article URL'};
  const path = toWsjPath(inputUrl);
  if (!path) return {error: 'Invalid WSJ URL', hint: 'URL must be on wsj.com'};

  const resp = await fetch(path, {credentials: 'include'});
  if (!resp.ok) return {error: 'HTTP ' + resp.status, url: inputUrl, hint: 'Open wsj.com in browser and make sure the article is accessible'};

  const html = await resp.text();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const article = readNextData(doc)?.props?.pageProps?.articleData;

  if (article) {
    const paragraphs = extractBody(article.flattenedBody || []);
    return {
      source: 'WSJ',
      url: cleanUrl(article.canonicalUrl || article.sourceUrl || inputUrl),
      title: getText(article.headline) || getText(article.originalHeadline) || doc.title || '',
      subtitle: getText(article.standFirst?.content) || getAltSummary(article) || '',
      fullText: paragraphs.join('\n\n'),
      paragraphs,
      time: article.publishedDateTimeUtc || article.liveDateTimeUtc || '',
      updatedTime: article.updatedDateTimeUtc || '',
      authors: normalizeAuthors(article.authors || article.byline),
      section: article.sectionName || article.articleType?.name || '',
      flashline: getText(article.flashline) || getText(article.mobileFlashline?.flattened) || '',
      id: article.id || article.originId || '',
      wordCount: article.meta?.metrics?.wordCount || paragraphs.join(' ').split(/\s+/).filter(Boolean).length
    };
  }

  const title = text(doc.querySelector('h1')) || doc.querySelector('meta[property="og:title"]')?.content || doc.title;
  const subtitle = text(doc.querySelector('h2, [data-testid*="summary"], [class*="summary"]')) || doc.querySelector('meta[name="description"]')?.content || '';
  const paragraphs = Array.from(doc.querySelectorAll('article p, [data-testid="article-body"] p')).map(text).filter(p => p.length > 20);
  return {source: 'WSJ', url: cleanUrl(inputUrl), title, subtitle, fullText: paragraphs.join('\n\n'), paragraphs, time: doc.querySelector('time')?.getAttribute('datetime') || '', authors: extractDomAuthors(doc)};
}
