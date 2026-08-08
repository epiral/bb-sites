/* @meta
{
  "name": "investing/revenue",
  "description": "Get revenue and net income chart data for a stock",
  "domain": "www.investing.com",
  "args": {
    "id": {"required": true, "description": "Instrument ID (use investing/search to find it)"},
    "period": {"required": false, "description": "Annual or Quarterly (default: Annual)"},
    "points": {"required": false, "description": "Number of periods (default: 8)"}
  },
  "capabilities": ["network"],
  "readOnly": true,
  "example": "bb-browser site investing/revenue 6408"
}
*/

async function(args) {
  if (!args.id) return {error: 'Missing argument: id'};
  const period = args.period || 'Annual';
  const points = parseInt(args.points) || 8;

  const url = 'https://api.investing.com/api/financialdata/revenue/chart/?instrumentid=' +
    args.id + '&period=' + period + '&pointscount=' + points;
  const resp = await fetch(url);
  if (!resp.ok) return {error: 'HTTP ' + resp.status};
  const data = await resp.json();
  if (data['@errors']) return {error: data['@errors'].join('; ')};

  const chart = data.chart_data || {};
  const intervals = chart.interval || [];
  const revenue = chart.datasets?.one || [];
  const netIncome = chart.datasets?.two || [];

  return {
    instrument_id: parseInt(args.id),
    period: period,
    data: intervals.map((ts, i) => ({
      date: new Date(ts).toISOString().slice(0, 10),
      revenue: revenue[i] || 0,
      net_income: netIncome[i] || 0
    }))
  };
}
