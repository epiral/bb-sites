/* @meta
{
  "name": "investing/chart",
  "description": "Get OHLCV chart data for any financial instrument",
  "domain": "www.investing.com",
  "args": {
    "id": {"required": true, "description": "Instrument ID (use investing/search to find it)"},
    "interval": {"required": false, "description": "Time interval: 1m/5m/15m/30m/1h/5h/1d/1w/1M (default: 1d)"},
    "points": {"required": false, "description": "Number of data points: 60/70/90/110/120/140/160 (default: 60)"}
  },
  "capabilities": ["network"],
  "readOnly": true,
  "example": "bb-browser site investing/chart 6408 --interval 1d --points 60"
}
*/

async function(args) {
  if (!args.id) return {error: 'Missing argument: id'};

  const intervalMap = {
    '1m': 'PT1M', '5m': 'PT5M', '15m': 'PT15M', '30m': 'PT30M',
    '1h': 'PT1H', '5h': 'PT5H', '1d': 'P1D', '1w': 'P1W', '1M': 'P1M'
  };
  const interval = intervalMap[args.interval] || args.interval || 'P1D';
  const points = parseInt(args.points) || 60;

  const url = 'https://api.investing.com/api/financialdata/' + args.id +
    '/historical/chart/?interval=' + interval + '&pointscount=' + points;
  const resp = await fetch(url);
  if (!resp.ok) return {error: 'HTTP ' + resp.status};
  const data = await resp.json();
  if (data['@errors']) return {error: data['@errors'].join('; ')};

  return {
    instrument_id: parseInt(args.id),
    interval: interval,
    count: data.data?.length || 0,
    data: (data.data || []).map(d => ({
      time: new Date(d[0]).toISOString(),
      open: d[1], high: d[2], low: d[3], close: d[4],
      volume: d[5]
    }))
  };
}
