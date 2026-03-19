/* @meta
{
  "name": "zujuan/questions",
  "description": "Search questions from Zujuan (组卷网) - China's largest K-12 question bank with 18M+ questions",
  "domain": "zujuan.xkw.com",
  "args": {
    "subject": {"required": true, "description": "Subject: 高中数学/初中物理/数学 (defaults to senior high). bankId: 1-9 junior, 10-18 senior"},
    "page": {"required": false, "description": "Page number (default: 1)"},
    "count": {"required": false, "description": "Results per page (default: 10)"},
    "zsd": {"required": false, "description": "Knowledge point ID for filtering (get IDs from zujuan/knowledge-tree)"}
  },
  "capabilities": ["network"],
  "readOnly": true,
  "example": "bb-browser site zujuan/questions 高中数学"
}
*/

async function(args) {
  if (!args.subject) return {error: 'Missing argument: subject'};

  const BANK_MAP = {
    '高中语文':10,'高中数学':11,'高中英语':12,'高中物理':13,'高中化学':14,
    '高中生物':15,'高中政治':16,'高中历史':17,'高中地理':18,
    '初中语文':1,'初中数学':2,'初中英语':3,'初中物理':4,'初中化学':5,
    '初中生物':6,'初中政治':7,'初中历史':8,'初中地理':9,
    '语文':10,'数学':11,'英语':12,'物理':13,'化学':14,
    '生物':15,'政治':16,'历史':17,'地理':18
  };

  const bankId = BANK_MAP[args.subject] || parseInt(args.subject) || 11;
  const page = parseInt(args.page) || 1;
  const size = Math.min(parseInt(args.count) || 10, 50);

  const params = new URLSearchParams({bankId: String(bankId), page: String(page), size: String(size)});
  const resp = await fetch('https://zujuan.xkw.com/zujuan-api/question/list', {
    method: 'POST',
    credentials: 'include',
    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: params.toString()
  });
  if (!resp.ok) return {error: 'HTTP ' + resp.status, hint: 'Not logged in? Visit zujuan.xkw.com and login first'};

  const d = await resp.json();
  const html = d?.data?.html || '';
  const div = document.createElement('div');
  div.innerHTML = html;

  const items = Array.from(div.querySelectorAll('.tk-quest-item')).map(item => {
    const id = item.getAttribute('questionid') || '';
    const bid = item.getAttribute('bankid') || String(bankId);
    const infos = item.querySelectorAll('.info-cnt');
    const type = infos[0]?.textContent?.trim() || '';
    const difficulty = infos[1]?.textContent?.trim() || '';
    const source = item.querySelector('.ques-src')?.textContent?.trim() || '';
    const knowledge = Array.from(item.querySelectorAll('.knowledge-item'))
      .map(k => k.textContent?.trim()).join(', ');
    const stem = (item.querySelector('.exam-item__cnt')?.textContent?.trim() || '')
      .replace(/\s+/g, ' ');
    return {id, bankId: bid, type, difficulty, source, knowledge, stem};
  });

  // Get answer/parse image URLs
  const tokenMatch = document.cookie.match(/user_token=([^;]+)/);
  const userToken = tokenMatch ? tokenMatch[1] : '';

  for (const q of items) {
    try {
      const p = new URLSearchParams({quesId: q.id, bankId: q.bankId});
      const r = await fetch('https://zujuan.xkw.com/zujuan-api/check_ques_parse', {
        method: 'POST', credentials: 'include',
        headers: {'Content-Type': 'application/x-www-form-urlencoded'},
        body: p.toString()
      });
      const pd = await r.json();
      if (pd?.key) {
        q.parseImg = 'https://imzujuan.xkw.com/getAnswerAndParse/' + q.id + '/' + q.bankId + '/' + pd.key
          + '?enVqdWFu=' + userToken + '&width=884';
      }
    } catch {}
    await new Promise(r => setTimeout(r, 300));
  }

  return {subject: args.subject, bankId, page, count: items.length, total: d?.data?.total || null, items};
}
