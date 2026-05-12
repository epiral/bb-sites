/* @meta
{
  "name": "exa/search",
  "description": "Exa web search via MCP endpoint (title, url, text)",
  "domain": "mcp.exa.ai",
  "args": {
    "query": {"required": true, "description": "Search query"},
    "count": {"required": false, "description": "Number of results (default 10)"}
  },
  "capabilities": ["network"],
  "readOnly": true,
  "example": "bb-browser site exa/search \"bb-browser CLI\""
}
*/

async function(args) {
  if (!args.query) return {error: 'Missing argument: query', hint: 'Provide a search query string'};
  const numResults = args.count || 10;

  const resp = await fetch('https://mcp.exa.ai/mcp', {
    method: 'POST',
    headers: {
      'accept': 'application/json, text/event-stream',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'web_search_exa',
        arguments: {query: args.query, type: 'auto', numResults, livecrawl: 'fallback'}
      }
    })
  });

  if (!resp.ok) return {error: 'HTTP ' + resp.status};

  const responseText = await resp.text();

  function extractContentText(payload) {
    let parsed;
    try { parsed = JSON.parse(payload); } catch { return null; }
    const content = parsed?.result?.content;
    if (!Array.isArray(content)) return null;
    const text = content.map(item => (item.text || '').trim()).filter(Boolean).join('\n\n');
    return text || null;
  }

  function parseTextChunk(raw) {
    const items = [];
    // Results are separated by \n---\n
    for (const chunk of raw.split(/\n---\n/)) {
      const lines = chunk.split('\n');
      let title = '', url = '', fullText = '', contentStartIndex = -1;
      lines.forEach((line, index) => {
        if (line.startsWith('Title:')) {
          title = line.replace(/^Title:\s*/, '');
        } else if (line.startsWith('URL:')) {
          url = line.replace(/^URL:\s*/, '');
        } else if ((line.startsWith('Text:') || line.startsWith('Highlights:')) && contentStartIndex === -1) {
          contentStartIndex = index;
          fullText = line.replace(/^(?:Text|Highlights):\s*/, '');
        }
      });
      if (contentStartIndex !== -1) {
        const rest = lines.slice(contentStartIndex + 1).join('\n');
        if (rest.trim()) fullText = fullText ? `${fullText}\n${rest}` : rest;
      }
      if (title || url || fullText) items.push({title, url, text: fullText});
    }
    return items;
  }

  const payloadTexts = [];

  for (const line of responseText.split('\n')) {
    if (!line.startsWith('data: ')) continue;
    const payload = line.slice(6).trim();
    if (!payload || payload === '[DONE]') continue;
    const text = extractContentText(payload);
    if (text) payloadTexts.push(text);
  }

  if (payloadTexts.length === 0) {
    const text = extractContentText(responseText);
    if (text) payloadTexts.push(text);
  }

  if (payloadTexts.length === 0 && responseText.includes('Title:')) {
    payloadTexts.push(responseText);
  }

  if (payloadTexts.length === 0) return {error: 'No parseable content in response'};

  const raw = payloadTexts.join('\n\n');
  const parsed = parseTextChunk(raw).filter(r => r.title || r.url || r.text);
  const results = parsed.slice(0, numResults).map(r => ({
    title: r.title.trim(),
    url: r.url.trim(),
    content: r.text.trim()
  }));

  return {query: args.query, count: results.length, results};
}
