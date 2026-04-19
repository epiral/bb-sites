/* @meta
{
  "name": "arxiv/search",
  "description": "Search arXiv papers by query",
  "domain": "arxiv.org",
  "args": {
    "query": {"required": true, "description": "Search query"},
    "count": {"required": false, "description": "Number of results (default 10, max 50)"}
  },
  "readOnly": true,
  "example": "bb-browser site arxiv/search \"large language model\""
}
*/

async function(args) {
  const query = args.query;
  if (!query) return {error: 'query is required'};
  const count = Math.min(args.count || 10, 50);

  const url = `/search/?query=${encodeURIComponent(query)}&searchtype=all&start=0`;
  const resp = await fetch(url, {credentials: 'include'});
  if (!resp.ok) return {error: 'HTTP ' + resp.status, hint: 'Make sure an arxiv.org tab is open'};

  const html = await resp.text();
  const doc = new DOMParser().parseFromString(html, 'text/html');

  const items = doc.querySelectorAll('li.arxiv-result, ol.breathe-horizontal > li');
  const papers = [];

  items.forEach(li => {
    if (papers.length >= count) return;
    const titleEl = li.querySelector('.title');
    const title = titleEl ? titleEl.textContent.trim().replace(/\s+/g, ' ') : '';
    if (!title) return;

    const idEl = li.querySelector('.list-title a');
    const rawHref = idEl?.getAttribute('href') || '';
    const absLink = rawHref.startsWith('/') ? 'https://arxiv.org' + rawHref : rawHref;
    const arxivId = rawHref.replace(/^.*\/abs\//, '');

    const authorEls = li.querySelectorAll('.authors a');
    const authors = Array.from(authorEls).map(a => a.textContent.trim());

    const abstractEl = li.querySelector('.abstract-full') || li.querySelector('.abstract-short');
    const abstract = abstractEl ? abstractEl.textContent.trim().replace(/\s+/g, ' ').replace(/^▽ /, '').replace(/ △ Less$/, '').substring(0, 500) : '';

    const dateEl = li.querySelector('.is-size-7');
    const dateText = dateEl?.textContent?.trim() || '';
    const dateMatch = dateText.match(/Submitted\s+(\d{1,2}\s+\w+,?\s+\d{4})/);
    const published = dateMatch ? dateMatch[1] : '';

    const tagEls = li.querySelectorAll('.tag');
    const categories = Array.from(tagEls).map(t => t.textContent.trim()).filter(Boolean);

    papers.push({
      id: arxivId,
      title,
      abstract,
      authors,
      published,
      categories,
      url: absLink.startsWith('/') ? 'https://arxiv.org' + absLink : absLink,
      pdf: arxivId ? `https://arxiv.org/pdf/${arxivId}` : ''
    });
  });

  const totalEl = doc.querySelector('.title.is-clearfix h1');
  const totalMatch = totalEl?.textContent?.match(/of\s+([\d,]+)/);
  const totalResults = totalMatch ? parseInt(totalMatch[1].replace(/,/g, '')) : papers.length;

  return {
    query,
    totalResults,
    count: papers.length,
    papers
  };
}
