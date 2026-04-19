/* @meta
{
  "name": "eastmoney/stock",
  "description": "东方财富股票行情 (stock quote: price, change%, volume, market cap)",
  "domain": "quote.eastmoney.com",
  "args": {
    "query": {"required": true, "description": "股票名称或代码，如 贵州茅台 或 600519"}
  },
  "readOnly": true,
  "example": "bb-browser site eastmoney/stock 贵州茅台"
}
*/

async function(args) {
  if (!args.query) return {error: 'Missing argument: query', hint: '请输入股票名称或代码'};

  // Step 1: Search for the stock to resolve secid
  var q = encodeURIComponent(args.query);
  var searchResp = await fetch('https://searchapi.eastmoney.com/api/suggest/get?input=' + q + '&type=14&count=5');
  if (!searchResp.ok) return {error: '搜索失败: HTTP ' + searchResp.status};

  var searchData = await searchResp.json();
  var results = (searchData.QuotationCodeTable && searchData.QuotationCodeTable.Data) || [];
  if (results.length === 0) return {error: '未找到股票: ' + args.query};

  // Use the first match
  var match = results[0];
  var secid = match.QuoteID; // e.g. "1.600519"
  if (!secid) {
    // Fallback: construct from MktNum and Code
    secid = match.MktNum + '.' + match.Code;
  }

  // Step 2: Fetch real-time quote
  // f43=最新价 f44=最高 f45=最低 f46=开盘 f47=成交量(手) f48=成交额
  // f57=代码 f58=名称 f60=昨收 f170=涨跌幅(bp) f169=涨跌额 f171=振幅
  // f116=总市值 f117=流通市值 f162=市盈率(动) f167=市净率
  var fields = 'f43,f44,f45,f46,f47,f48,f57,f58,f60,f169,f170,f171,f116,f117,f162,f167';
  var quoteResp = await fetch('https://push2.eastmoney.com/api/qt/stock/get?secid=' + secid + '&fields=' + fields);
  if (!quoteResp.ok) return {error: '行情获取失败: HTTP ' + quoteResp.status};

  var quoteData = await quoteResp.json();
  var d = quoteData.data;
  if (!d) return {error: '无行情数据', secid: secid};

  // Prices are in cents (分), convert to yuan
  var divisor = 100;
  var price = d.f43 != null ? (d.f43 / divisor).toFixed(2) : null;
  var high = d.f44 != null ? (d.f44 / divisor).toFixed(2) : null;
  var low = d.f45 != null ? (d.f45 / divisor).toFixed(2) : null;
  var open = d.f46 != null ? (d.f46 / divisor).toFixed(2) : null;
  var prevClose = d.f60 != null ? (d.f60 / divisor).toFixed(2) : null;
  var change = d.f169 != null ? (d.f169 / divisor).toFixed(2) : null;
  var changePercent = d.f170 != null ? (d.f170 / 100).toFixed(2) + '%' : null;
  var amplitude = d.f171 != null ? (d.f171 / 100).toFixed(2) + '%' : null;

  // Volume in lots (手), amount in yuan
  var volume = d.f47 != null ? d.f47 : null;
  var amount = d.f48 != null ? d.f48 : null;

  // Market cap in yuan
  var marketCap = d.f116 != null ? d.f116 : null;
  var floatMarketCap = d.f117 != null ? d.f117 : null;
  var pe = d.f162 != null ? (d.f162 / 100).toFixed(2) : null;
  var pb = d.f167 != null ? (d.f167 / 100).toFixed(2) : null;

  // Format large numbers
  function fmtAmount(v) {
    if (v == null) return null;
    if (v >= 1e12) return (v / 1e12).toFixed(2) + '万亿';
    if (v >= 1e8) return (v / 1e8).toFixed(2) + '亿';
    if (v >= 1e4) return (v / 1e4).toFixed(2) + '万';
    return v.toString();
  }

  return {
    name: d.f58 || match.Name,
    code: d.f57 || match.Code,
    secid: secid,
    market: match.SecurityTypeName || (match.MktNum === '1' ? '沪A' : '深A'),
    price: price,
    change: change,
    changePercent: changePercent,
    open: open,
    high: high,
    low: low,
    prevClose: prevClose,
    amplitude: amplitude,
    volume: volume != null ? volume + '手' : null,
    amount: fmtAmount(amount),
    marketCap: fmtAmount(marketCap),
    floatMarketCap: fmtAmount(floatMarketCap),
    pe: pe,
    pb: pb,
    url: 'https://quote.eastmoney.com/' + match.Code + '.html',
    otherMatches: results.length > 1 ? results.slice(1).map(function(r) {
      return {code: r.Code, name: r.Name, type: r.SecurityTypeName};
    }) : []
  };
}
