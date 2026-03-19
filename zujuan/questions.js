/* @meta
{
  "name": "zujuan/questions",
  "description": "Search questions from Zujuan (组卷网) with rich filters - 18M+ K-12 questions",
  "domain": "zujuan.xkw.com",
  "args": {
    "subject": {"required": true, "description": "Subject: 高中数学/初中物理/数学 (defaults to senior high)"},
    "page": {"required": false, "description": "Page number (default: 1)"},
    "count": {"required": false, "description": "Max results (default: 10, page has 10)"},
    "zsd": {"required": false, "description": "Knowledge point ID (from zujuan/knowledge-tree)"},
    "difficulty": {"required": false, "description": "容易/较易/适中/较难/困难"},
    "type": {"required": false, "description": "单选题/多选题/填空题/解答题/判断题/实验题/综合题"},
    "source": {"required": false, "description": "课前预习/课后作业/单元测试/月考/期中/期末/高考模拟/高考真题/专题练习/竞赛"},
    "category": {"required": false, "description": "典型题/压轴题/同步题/课本原题"},
    "year": {"required": false, "description": "2026/2025/2024/..."},
    "grade": {"required": false, "description": "高一/高二/高三/七年级/八年级/九年级"},
    "semester": {"required": false, "description": "上学期/下学期"},
    "newOnly": {"required": false, "description": "Only new questions: true"},
    "sort": {"required": false, "description": "综合/最新/最热 (default: 最新)"},
    "method": {"required": false, "description": "Solving method kf ID"}
  },
  "capabilities": ["network"],
  "readOnly": true,
  "example": "bb-browser site zujuan/questions 高中数学 --difficulty 较难 --source 高考真题 --year 2025"
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
  var DIFF = {'容易':'d1','较易':'d2','适中':'d3','较难':'d4','困难':'d5'};
  var SRC = {'课前预习':'pt31','课后作业':'pt1','单元测试':'pt2','月考':'pt3','期中':'pt4','期末':'pt5',
    '高考模拟':'pt9','高考真题':'pt6','中考真题':'pt7','中考模拟':'pt8','学业考试':'pt12',
    '开学考试':'pt15','专题练习':'pt32','竞赛':'pt13','强基计划':'pt14'};
  var QT = {'单选题':'qt2701','多选题':'qt2702','填空题':'qt2703','解答题':'qt2704',
    '判断题':'qt2706','概念填空':'qt2707','实验题':'qt2705','综合题':'qt2708','作图题':'qt2709'};
  var CAT = {'同步题':'fl3','典型题':'fl4081','压轴题':'fl4802','课本原题':'fl4805','新文化题':'fl4809'};
  var GRD = {'高一':'g10','高二':'g11','高三':'g12','七年级':'g7','八年级':'g8','九年级':'g9'};
  var SEM = {'上学期':'te1','下学期':'te2'};
  var SORT = {'综合':'o0','最新':'o2','最热':'o1'};

  var bankId = BANK[args.subject] || parseInt(args.subject) || 11;
  var prefix = PREFIX[bankId] || 'gzsx';
  var page = parseInt(args.page) || 1;
  var count = parseInt(args.count) || 10;

  // 综合库 zsd ID (root knowledge node per subject)
  var ZSD_ROOT = {1:'4677',2:'188381',3:'18046',4:'18194',5:'19366',6:'19922',7:'20335',8:'21351',9:'22298',
    10:'23177',11:'27925',12:'29978',13:'41934',14:'43452',15:'44900',16:'45411',17:'46696',18:'47143'};

  // Build URL path: /{prefix}/zsd{zsd}/{filters}o{sort}p{page}/
  var zsd = args.zsd || ZSD_ROOT[bankId] || '27925';
  var segs = [];
  if (args.difficulty && DIFF[args.difficulty]) segs.push(DIFF[args.difficulty]);
  if (args.type && QT[args.type]) segs.push(QT[args.type]);
  if (args.source && SRC[args.source]) segs.push(SRC[args.source]);
  if (args.category && CAT[args.category]) segs.push(CAT[args.category]);
  if (args.year) segs.push('y' + args.year);
  if (args.grade && GRD[args.grade]) segs.push(GRD[args.grade]);
  if (args.semester && SEM[args.semester]) segs.push(SEM[args.semester]);
  if (args.newOnly === 'true' || args.newOnly === true) segs.push('x4');
  segs.push(SORT[args.sort] || 'o2');
  if (page > 1) segs.push('p' + page);

  var filterPath = segs.join('');
  var query = args.method ? '?kf=' + args.method : '';
  var url = 'https://zujuan.xkw.com/' + prefix + '/zsd' + zsd + '/' + filterPath + '/' + query;

  // Fetch filtered page (SSR) and parse with DOMParser
  var resp = await fetch(url, {credentials: 'include'});
  if (!resp.ok) return {error: 'HTTP ' + resp.status, url: url, hint: 'Not logged in?'};
  var html = await resp.text();
  var parser = new DOMParser();
  var doc = parser.parseFromString(html, 'text/html');

  var qItems = doc.querySelectorAll('.tk-quest-item');
  var items = Array.from(qItems).slice(0, count).map(function(item) {
    var id = item.getAttribute('questionid') || '';
    var bid = item.getAttribute('bankid') || String(bankId);
    var infos = item.querySelectorAll('.info-cnt');
    var type = infos[0] ? infos[0].textContent.trim() : '';
    var difficulty = infos[1] ? infos[1].textContent.trim() : '';
    var sourceEl = item.querySelector('.ques-src');
    var source = sourceEl ? sourceEl.textContent.trim() : '';
    var knowledge = Array.from(item.querySelectorAll('.knowledge-item'))
      .map(function(k) { return k.textContent.trim(); });
    var methods = Array.from(item.querySelectorAll('.method-list .item'))
      .map(function(m) { return m.textContent.trim(); });
    var stemEl = item.querySelector('.exam-item__cnt');
    var stem = stemEl ? stemEl.textContent.trim().replace(/\s+/g, ' ') : '';
    var useMatch = (item.textContent || '').match(/(\d+)次组卷/);
    return {id: id, bankId: bid, type: type, difficulty: difficulty, source: source,
      knowledge: knowledge, methods: methods, stem: stem,
      useCount: useMatch ? parseInt(useMatch[1]) : 0, parseImg: ''};
  });

  // Get total from page
  var totalEl = doc.querySelector('em[class], .total-count');
  var totalMatch = html.match(/共计[^<]*?(\d[\d,]+)/);
  var total = totalMatch ? parseInt(totalMatch[1].replace(/,/g, '')) : items.length;

  // Get answer/parse image URLs
  var tokenMatch = document.cookie.match(/user_token=([^;]+)/);
  var userToken = tokenMatch ? tokenMatch[1] : '';

  for (var i = 0; i < items.length; i++) {
    var q = items[i];
    try {
      var p = new URLSearchParams({quesId: q.id, bankId: q.bankId});
      var r = await fetch('https://zujuan.xkw.com/zujuan-api/check_ques_parse', {
        method: 'POST', credentials: 'include',
        headers: {'Content-Type': 'application/x-www-form-urlencoded'},
        body: p.toString()
      });
      var pd = await r.json();
      if (pd && pd.key) {
        q.parseImg = 'https://imzujuan.xkw.com/getAnswerAndParse/' + q.id + '/' + q.bankId + '/' + pd.key
          + '?enVqdWFu=' + userToken + '&width=884';
      }
    } catch(e) {}
    await new Promise(function(resolve) { setTimeout(resolve, 300); });
  }

  return {
    subject: args.subject, bankId: bankId, page: page, url: url,
    filters: {difficulty: args.difficulty||null, type: args.type||null, source: args.source||null,
      category: args.category||null, year: args.year||null, grade: args.grade||null,
      semester: args.semester||null, newOnly: args.newOnly||null, sort: args.sort||'最新',
      method: args.method||null},
    total: total, count: items.length, items: items
  };
}
