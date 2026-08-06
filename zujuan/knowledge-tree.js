/* @meta
{
  "name": "zujuan/knowledge-tree",
  "description": "Get knowledge point tree for a subject (知识点树)",
  "domain": "zujuan.xkw.com",
  "args": {
    "subject": {"required": true, "description": "Subject: 高中数学/初中物理/数学 etc. Or bankId (1-18)"},
    "depth": {"required": false, "description": "Max tree depth to return (default: 3)"}
  },
  "capabilities": ["network"],
  "readOnly": true,
  "example": "bb-browser site zujuan/knowledge-tree 高中数学"
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
  const maxDepth = parseInt(args.depth) || 3;

  const resp = await fetch('https://static.zxxk.com/zujuan/tree/lk_' + bankId + '.json?v=' + Date.now() + '&withCredentials=true');
  if (!resp.ok) return {error: 'HTTP ' + resp.status};
  const tree = await resp.json();

  const nodes = [];
  const walk = (node, level, path) => {
    if (level > maxDepth) return;
    const currentPath = node.title ? [...path, node.title] : path;
    const isLeaf = !node.children || node.children.length === 0;
    nodes.push({
      id: node.id || '',
      title: node.title || '',
      level,
      isLeaf,
      path: currentPath.join(' > ')
    });
    if (node.children) {
      for (const child of node.children) walk(child, level + 1, currentPath);
    }
  };
  walk(tree, 0, []);

  const leaves = nodes.filter(n => n.isLeaf);
  return {subject: args.subject, bankId, totalNodes: nodes.length, leafCount: leaves.length, nodes};
}
