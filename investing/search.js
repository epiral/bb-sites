/* @meta
{
  "name": "investing/search",
  "description": "Search financial instruments (stocks, indices, forex, crypto, commodities, ETFs)",
  "domain": "www.investing.com",
  "args": {
    "query": {"required": true, "description": "Search query (e.g. 'AAPL', 'bitcoin', 'S&P 500')"}
  },
  "capabilities": ["network"],
  "readOnly": true,
  "example": "bb-browser site investing/search AAPL"
}
*/

async function(args) {
  if (!args.query) return {error: 'Missing argument: query'};
  const resp = await fetch('https://api.investing.com/api/search/v2/search?q=' + encodeURIComponent(args.query));
  if (!resp.ok) return {error: 'HTTP ' + resp.status};
  const data = await resp.json();

  return {
    quotes: (data.quotes || []).map(q => ({
      id: q.id, symbol: q.symbol, name: q.description,
      exchange: q.exchange, type: q.type, flag: q.flag,
      url: 'https://www.investing.com' + q.url
    })),
    news: (data.news || []).slice(0, 5).map(n => ({
      id: n.id, title: n.description,
      url: 'https://www.investing.com' + n.url
    })),
    articles: (data.articles || []).slice(0, 5).map(a => ({
      id: a.id, title: a.description,
      url: 'https://www.investing.com' + a.url
    }))
  };
}
