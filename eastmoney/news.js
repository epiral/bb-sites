/* @meta
{
  "name": "eastmoney/news",
  "description": "东方财富财经新闻 (finance news: title, summary, source, url)",
  "domain": "www.eastmoney.com",
  "args": {
    "count": {"required": false, "description": "返回新闻条数，默认 20，最大 50"}
  },
  "readOnly": true,
  "example": "bb-browser site eastmoney/news"
}
*/

async function(args) {
  var count = Math.min(parseInt(args.count) || 20, 50);
  var trace = Date.now().toString();

  // column=350 is the main finance news feed
  var url = 'https://np-listapi.eastmoney.com/comm/web/getNewsByColumns?client=web&biz=web_news_col&column=350&pageSize=' + count + '&page=1&req_trace=' + trace;

  var resp = await fetch(url);
  if (!resp.ok) return {error: '新闻获取失败: HTTP ' + resp.status};

  var data = await resp.json();
  if (data.code !== '1' && data.code !== 1) {
    return {error: '接口返回错误: ' + (data.message || JSON.stringify(data))};
  }

  var list = (data.data && data.data.list) || [];
  if (list.length === 0) return {error: '暂无新闻数据'};

  var news = list.map(function(item, i) {
    return {
      rank: i + 1,
      title: item.title,
      summary: (item.summary || '').substring(0, 200),
      source: item.mediaName || '',
      time: item.showTime || '',
      url: item.uniqueUrl || item.url || ''
    };
  });

  return {
    count: news.length,
    fetchTime: new Date().toISOString(),
    news: news
  };
}
