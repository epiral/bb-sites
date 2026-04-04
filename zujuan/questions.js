/* @meta
{
  "name": "zujuan/questions",
  "description": "Search questions from Zujuan (组卷网) - 18M+ K-12 questions with rich filters",
  "domain": "zujuan.xkw.com",
  "args": {
    "subject": {"required": true, "description": "学科: 高中数学/初中物理/数学"},
    "filter": {"required": false, "description": "筛选条件，用+连接: 较难+高考真题+单选题+2025+高三"},
    "zsd": {"required": false, "description": "知识点ID (from zujuan/knowledge-tree)"},
    "page": {"required": false, "description": "页码 (default: 1)"},
    "count": {"required": false, "description": "数量 (default: 10)"},
    "noParse": {"required": false, "description": "跳过解析(更快): true"}
  },
  "capabilities": ["network"],
  "readOnly": true,
  "example": "bb-browser site zujuan/questions 高中数学 较难+高考真题+单选题"
}
*/

async function(args) {
  if (!args.subject) return {error: 'Missing argument: subject'};

  var BANK = {
    '高中语文':10,'高中数学':11,'高中英语':12,'高中物理':13,'高中化学':14,
    '高中生物':15,'高中政治':16,'高中历史':17,'高中地理':18,
    '初中语文':1,'初中数学':2,'初中英语':3,'初中物理':4,'初中化学':5,
    '初中生物':6,'初中政治':7,'初中历史':8,'初中地理':9,
    '语文':10,'数学':11,'英语':12,'物理':13,'化学':14,
    '生物':15,'政治':16,'历史':17,'地理':18
  };
  var PREFIX = {1:'czyw',2:'czsx',3:'czyy',4:'czwl',5:'czhx',6:'czsw',7:'czzz',8:'czls',9:'czdl',
    10:'gzyw',11:'gzsx',12:'gzyy',13:'gzwl',14:'gzhx',15:'gzsw',16:'gzzz',17:'gzls',18:'gzdl'};
  var ZSD_ROOT = {1:'4677',2:'188381',3:'18046',4:'18194',5:'19366',6:'19922',7:'20335',8:'21351',9:'22298',
    10:'23177',11:'27925',12:'29978',13:'41934',14:'43452',15:'44900',16:'45411',17:'46696',18:'47143'};

  // Filter token → URL segment mapping
  var FILTERS = {
    '容易':'d1','较易':'d2','适中':'d3','较难':'d4','困难':'d5',
    '课前预习':'pt31','课后作业':'pt1','单元测试':'pt2','月考':'pt3','期中':'pt4','期末':'pt5',
    '高考模拟':'pt9','高考真题':'pt6','中考真题':'pt7','中考模拟':'pt8','学业考试':'pt12',
    '开学考试':'pt15','专题练习':'pt32','竞赛':'pt13','强基计划':'pt14',
    '单选题':'qt2701','多选题':'qt2702','填空题':'qt2703','解答题':'qt2704',
    '判断题':'qt2706','概念填空':'qt2707','实验题':'qt2705','综合题':'qt2708','作图题':'qt2709',
    '同步题':'fl3','典型题':'fl4081','压轴题':'fl4802','课本原题':'fl4805','新文化题':'fl4809',
    '高一':'g10','高二':'g11','高三':'g12','七年级':'g7','八年级':'g8','九年级':'g9',
    '上学期':'te1','下学期':'te2','新题':'x4'
  };

  var bankId = BANK[args.subject] || parseInt(args.subject) || 11;
  var prefix = PREFIX[bankId] || 'gzsx';
  var page = parseInt(args.page) || 1;
  var count = parseInt(args.count) || 10;
  var zsd = args.zsd || ZSD_ROOT[bankId] || '27925';

  // Parse filter string: "较难+高考真题+单选题+2025"
  var segs = [];
  var appliedFilters = [];
  if (args.filter) {
    var tokens = args.filter.split('+');
    for (var t = 0; t < tokens.length; t++) {
      var token = tokens[t].trim();
      if (!token) continue;
      if (FILTERS[token]) {
        segs.push(FILTERS[token]);
        appliedFilters.push(token);
      } else if (/^\d{4}$/.test(token)) {
        segs.push('y' + token);
        appliedFilters.push(token);
      }
    }
  }
  segs.push('o2');
  if (page > 1) segs.push('p' + page);

  var url = 'https://zujuan.xkw.com/' + prefix + '/zsd' + zsd + '/' + segs.join('') + '/';

  var resp = await fetch(url, {credentials: 'include'});
  if (!resp.ok) return {error: 'HTTP ' + resp.status, url: url, hint: 'Not logged in?'};
  var html = await resp.text();
  var parser = new DOMParser();
  var doc = parser.parseFromString(html, 'text/html');

  // Helper: extract text + image alt/src from element (preserves formula info)
  function extractContent(el) {
    if (!el) return {text: '', html: ''};
    // Get inner HTML (contains img tags with formulas)
    var rawHtml = el.innerHTML;
    // Build text with image placeholders
    var clone = el.cloneNode(true);
    clone.querySelectorAll('img').forEach(function(img) {
      var alt = img.getAttribute('alt') || '';
      var src = img.getAttribute('src') || '';
      // Replace img with [formula] or [图] placeholder
      var placeholder = alt ? '[' + alt + ']' : (src.indexOf('formula') >= 0 || src.indexOf('latex') >= 0 || src.indexOf('Img') >= 0) ? '[公式]' : '[图]';
      img.replaceWith(placeholder);
    });
    return {text: clone.textContent.trim().replace(/\s+/g, ' '), html: rawHtml.trim()};
  }

  var qItems = doc.querySelectorAll('.tk-quest-item');
  var items = Array.from(qItems).slice(0, count).map(function(item) {
    var id = item.getAttribute('questionid') || '';
    var bid = item.getAttribute('bankid') || String(bankId);
    var infos = item.querySelectorAll('.info-cnt');
    var stemEl = item.querySelector('.exam-item__cnt');
    var stemContent = extractContent(stemEl);
    return {
      id: id, bankId: bid,
      type: infos[0] ? infos[0].textContent.trim() : '',
      difficulty: infos[1] ? infos[1].textContent.trim() : '',
      source: (item.querySelector('.ques-src') || {textContent:''}).textContent.trim(),
      knowledge: Array.from(item.querySelectorAll('.knowledge-item')).map(function(k){return k.textContent.trim()}),
      methods: Array.from(item.querySelectorAll('.method-list .item')).map(function(m){return m.textContent.trim()}),
      stem: stemContent.text,
      stemHtml: stemContent.html,
      useCount: parseInt(((item.textContent || '').match(/(\d+)次组卷/) || [])[1]) || 0,
      parseImg: ''
    };
  });

  var totalMatch = html.match(/共计[^<]*?([\d,]+)/);
  var total = totalMatch ? parseInt(totalMatch[1].replace(/,/g, '')) : items.length;

  // Get parse image URLs
  if (args.noParse !== 'true' && args.noParse !== true) {
    var tokenMatch = document.cookie.match(/user_token=([^;]+)/);
    var userToken = tokenMatch ? tokenMatch[1] : '';
    for (var i = 0; i < items.length; i++) {
      try {
        var pr = await fetch('https://zujuan.xkw.com/zujuan-api/check_ques_parse', {
          method: 'POST', credentials: 'include',
          headers: {'Content-Type': 'application/x-www-form-urlencoded'},
          body: 'quesId=' + items[i].id + '&bankId=' + items[i].bankId
        });
        var pd = await pr.json();
        if (pd && pd.key) {
          items[i].parseImg = 'https://imzujuan.xkw.com/getAnswerAndParse/' + items[i].id + '/' + items[i].bankId + '/' + pd.key + '?enVqdWFu=' + userToken + '&width=884';
        }
      } catch(e) {}
      await new Promise(function(r) { setTimeout(r, 500); });
    }
  }

  return {
    subject: args.subject, bankId: bankId, page: page, url: url,
    filters: appliedFilters, total: total, count: items.length, items: items
  };
}
