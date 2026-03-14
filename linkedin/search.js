/* @meta
{
  "name": "linkedin/search",
  "description": "搜索 LinkedIn 帖子",
  "domain": "www.linkedin.com",
  "args": {
    "query": {"required": true, "description": "Search keyword"},
    "count": {"required": false, "description": "Max results to return (default 10)"}
  },
  "capabilities": ["network"],
  "readOnly": true,
  "example": "bb-browser site linkedin/search \"AI agent\""
}
*/

async function(args) {
  if (!args.query) return {error: 'Missing argument: query'};
  const maxResults = Math.min(parseInt(args.count) || 10, 30);

  // Get CSRF token from JSESSIONID cookie
  const jsessionid = document.cookie.split(';').map(c => c.trim())
    .find(c => c.startsWith('JSESSIONID='))?.split('=').slice(1).join('=');
  if (!jsessionid) return {error: 'No JSESSIONID cookie', hint: 'Please log in to https://www.linkedin.com first.'};
  const csrfToken = jsessionid.replace(/"/g, '');

  // Fetch search results page via fetch() — no navigation, no eval context loss
  const searchUrl = '/search/results/content/?keywords=' + encodeURIComponent(args.query);
  const resp = await fetch(searchUrl, {
    credentials: 'include',
    headers: { 'csrf-token': csrfToken }
  });
  if (!resp.ok) return {error: 'HTTP ' + resp.status, hint: 'Search fetch failed. Are you logged in?'};

  const html = await resp.text();

  // ── RSC payload format ──
  // The HTML contains React Server Components payload with \" (backslash-quote)
  // escaped JSON. In JS RegExp constructor: \\\\ matches literal \, \" matches "
  // Combined: \\\\"  matches the literal sequence \"

  // ── Step 1: Extract post metadata ──
  // actorName, postSlugUrl appear together; we also grab userGeneratedContentId
  const postMeta = [];
  const metaRe = new RegExp('\\\\"actorName\\\\":\\\\"([^"]+)\\\\"', 'g');
  let m;
  while ((m = metaRe.exec(html)) !== null) {
    const name = m[1];
    const pos = m.index;
    const nearby = html.substring(pos, Math.min(pos + 2000, html.length));
    const rawSlug = (nearby.match(new RegExp('\\\\"postSlugUrl\\\\":\\\\"(https:[^"]+)\\\\"')) || [])[1] || '';
    const slug = rawSlug.replace(/\\\\/g, '').split('\\"')[0];
    postMeta.push({name, slug});
  }

  // ── Step 2: Extract post text content ──
  // Text content is in RSC $L247 components with \"textProps\".
  // Two formats exist:
  //   Format A (text-attr): nested children arrays with $17 text spans
  //   Format B (direct):    text directly in \"children\":[\"TEXT\"] with \\n newlines

  const textBlocks = [];
  let searchIdx = 0;
  const tpMarker = '\\"textProps\\"';

  while (true) {
    const tpIdx = html.indexOf(tpMarker, searchIdx);
    if (tpIdx === -1) break;

    const block = html.substring(tpIdx, Math.min(tpIdx + 15000, html.length));
    const hasTextAttr = block.substring(0, 300).includes('text-attr');
    let fullText = '';

    if (hasTextAttr) {
      // Format A: text in \"children\":[null,\"TEXT\"] and [\"$\",\"br\",null,{}],\"TEXT\"]
      const segments = [];

      const p1 = new RegExp('\\\\"children\\\\":\\[null,\\\\"(.*?)\\\\"\\]', 'g');
      let seg;
      while ((seg = p1.exec(block)) !== null) {
        const t = seg[1];
        if (t.length > 0 && !t.startsWith('$')) segments.push(t);
      }

      const p2 = new RegExp('\\[\\\\"\\$\\\\",\\\\"br\\\\",null,\\{\\}\\],\\\\"(.*?)\\\\"\\]', 'g');
      while ((seg = p2.exec(block)) !== null) {
        const t = seg[1];
        if (t.length > 0 && !t.startsWith('$')) segments.push(t);
      }

      if (segments.length > 0) {
        fullText = segments.join('\n');
      }
    } else {
      // Format B: text directly in \"children\":[\"TEXT\"]
      // with \\n as newlines and lineClamp nearby
      const directMatch = block.match(new RegExp('\\\\"children\\\\":\\[\\\\"((?:[^"\\\\]|\\\\.)*)\\\\"\\ ], *\\\\"lineClamp\\\\"'));
      if (!directMatch) {
        // Try without lineClamp requirement
        const altMatch = block.match(new RegExp('\\\\"children\\\\":\\[\\\\"((?:[^"\\\\]|\\\\.){50,})\\\\"\\]'));
        if (altMatch) {
          fullText = altMatch[1].replace(/\\\\n/g, '\n');
        }
      } else {
        fullText = directMatch[1].replace(/\\\\n/g, '\n');
      }
    }

    if (fullText.length > 20) {
      // Clean up escape sequences
      fullText = fullText
        .replace(/\\\\u00a0/g, '\u00a0')
        .replace(/\\\\u2019/g, '\u2019')
        .replace(/\\\\u2018/g, '\u2018')
        .replace(/\\\\u201c/g, '\u201c')
        .replace(/\\\\u201d/g, '\u201d')
        .replace(/\\\\u2014/g, '\u2014')
        .replace(/\\\\u2013/g, '\u2013');

      // Deduplicate: skip if we already have a block with the same start
      const key = fullText.substring(0, 100);
      if (!textBlocks.some(b => b.text.substring(0, 100) === key)) {
        textBlocks.push({pos: tpIdx, text: fullText});
      }
    }

    searchIdx = tpIdx + 1;
  }

  // ── Step 3: Pair metadata with text ──
  // Both appear in the same document order
  const posts = [];
  const limit = Math.min(postMeta.length, textBlocks.length, maxResults);
  for (let i = 0; i < limit; i++) {
    posts.push({
      author: postMeta[i].name,
      url: postMeta[i].slug,
      text: textBlocks[i].text.substring(0, 800)
    });
  }

  // If metadata found but no text (e.g. image-only posts), still return authors
  if (posts.length === 0 && postMeta.length > 0) {
    const fallbackLimit = Math.min(postMeta.length, maxResults);
    for (let i = 0; i < fallbackLimit; i++) {
      posts.push({
        author: postMeta[i].name,
        url: postMeta[i].slug,
        text: '(text extraction failed)'
      });
    }
  }

  if (posts.length === 0) {
    return {
      error: 'No posts found',
      hint: 'Fetched ' + html.length + ' bytes but could not extract posts. Make sure you are logged in.'
    };
  }

  return {query: args.query, count: posts.length, posts};
}
