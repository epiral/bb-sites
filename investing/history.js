/* @meta
{
  "name": "investing/history",
  "description": "Get historical price data table with formatted OHLCV and change percentage",
  "domain": "www.investing.com",
  "args": {
    "id": {"required": true, "description": "Instrument ID (use investing/search to find it)"},
    "from": {"required": false, "description": "Start date YYYY-MM-DD (default: 30 days ago)"},
    "to": {"required": false, "description": "End date YYYY-MM-DD (default: today)"},
    "timeframe": {"required": false, "description": "Daily/Weekly/Monthly (default: Daily)"}
  },
  "capabilities": ["network"],
  "readOnly": true,
  "example": "bb-browser site investing/history 6408 --from 2026-01-01"
}
*/

async function(args) {
  if (!args.id) return {error: 'Missing argument: id'};

  const to = args.to || new Date().toISOString().slice(0, 10);
  const from = args.from || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const timeframe = args.timeframe || 'Daily';

  const url = 'https://api.investing.com/api/financialdata/historical/' + args.id +
    '?start-date=' + from + '&end-date=' + to +
    '&time-frame=' + timeframe + '&add-missing-rows=false';

  const resp = await fetch(url, {headers: {'domain-id': 'www'}});
  if (!resp.ok) return {error: 'HTTP ' + resp.status};
  const data = await resp.json();
  if (data['@errors']) return {error: data['@errors'].join('; ')};

  return {
    instrument_id: parseInt(args.id),
    from: from, to: to, timeframe: timeframe,
    count: data.data?.length || 0,
    data: (data.data || []).map(d => ({
      date: d.rowDate,
      open: parseFloat(d.last_openRaw),
      high: parseFloat(d.last_maxRaw),
      low: parseFloat(d.last_minRaw),
      close: parseFloat(d.last_closeRaw),
      volume: d.volumeRaw,
      change_pct: d.change_precentRaw
    }))
  };
}
