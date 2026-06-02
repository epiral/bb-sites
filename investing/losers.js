/* @meta
{
  "name": "investing/losers",
  "description": "Get top losing US stocks",
  "domain": "www.investing.com",
  "args": {},
  "capabilities": ["network"],
  "readOnly": true,
  "example": "bb-browser site investing/losers"
}
*/

async function(args) {
  const resp = await fetch('https://api.investing.com/api/financialdata/table/domain/losersStocks?fieldmap=stocks.marketMoversUS&filter-domain=www');
  if (!resp.ok) return {error: 'HTTP ' + resp.status};
  const data = await resp.json();
  if (data['@errors']) return {error: data['@errors'].join('; ')};

  return {
    count: data.data?.length || 0,
    stocks: (data.data || []).map(d => ({
      id: parseInt(d.pair),
      symbol: d.symbol,
      name: d.name,
      price: parseFloat(d.data?.[1]),
      change_pct: parseFloat(d.data?.[2]),
      volume: parseInt(d.volume),
      exchange: d.exchange_symbol,
      url: 'https://www.investing.com' + d.url
    }))
  };
}
