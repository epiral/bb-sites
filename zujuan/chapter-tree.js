/* @meta
{
  "name": "zujuan/chapter-tree",
  "description": "Get chapter tree for a subject + textbook edition, with knowledge point mapping (章节树+知识点映射)",
  "domain": "zujuan.xkw.com",
  "args": {
    "subject": {"required": true, "description": "Subject: 高中数学/初中物理 etc."},
    "edition": {"required": true, "description": "Textbook edition ID (e.g. 135303=人教A版高中数学, 58507=人教版初中数学)"}
  },
  "capabilities": ["network"],
  "readOnly": true,
  "example": "bb-browser site zujuan/chapter-tree 高中数学 135303"
}
*/

async function(args) {
  if (!args.subject) return {error: 'Missing argument: subject'};
  if (!args.edition) return {error: 'Missing argument: edition (textbook edition ID, e.g. 135303)'};

  const BANK_MAP = {
    '高中语文':10,'高中数学':11,'高中英语':12,'高中物理':13,'高中化学':14,
    '高中生物':15,'高中政治':16,'高中历史':17,'高中地理':18,
    '初中语文':1,'初中数学':2,'初中英语':3,'初中物理':4,'初中化学':5,
    '初中生物':6,'初中政治':7,'初中历史':8,'初中地理':9,
    '语文':10,'数学':11,'英语':12,'物理':13,'化学':14,
    '生物':15,'政治':16,'历史':17,'地理':18
  };

  const bankId = BANK_MAP[args.subject] || parseInt(args.subject) || 11;
  const editionId = args.edition;

  const resp = await fetch('https://static.zxxk.com/zujuan/tree/ct_' + bankId + '_' + editionId + '.json?v=' + Date.now());
  if (!resp.ok) return {error: 'HTTP ' + resp.status, hint: 'Invalid edition ID? Check zujuan/editions for valid IDs'};
  const tree = await resp.json();

  const chapters = [];
  const mappings = [];

  const walk = (node, path) => {
    const currentPath = node.title ? [...path, node.title] : path;
    const hrefMatch = (node.href || '').match(/zj(\d+)/);

    if (node.isKnowledge === 1 && (!node.children || node.children.length === 0)) {
      mappings.push({
        knowledgeId: node.id,
        knowledgeTitle: node.title,
        chapterId: hrefMatch ? hrefMatch[1] : '',
        chapterPath: currentPath.slice(0, -1).join(' > ')
      });
    } else if (node.title) {
      chapters.push({
        id: hrefMatch ? hrefMatch[1] : node.id || '',
        title: node.title,
        level: currentPath.length - 1,
        path: currentPath.join(' > ')
      });
    }

    if (node.children) {
      for (const child of node.children) walk(child, currentPath);
    }
  };
  walk(tree, []);

  return {subject: args.subject, bankId, editionId, chapterCount: chapters.length, mappingCount: mappings.length, chapters, mappings};
}
