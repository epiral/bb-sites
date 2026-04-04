/* @meta
{
  "name": "zujuan/subjects",
  "description": "List all supported subjects and their bankIds (列出所有学科)",
  "domain": "zujuan.xkw.com",
  "args": {},
  "readOnly": true,
  "example": "bb-browser site zujuan/subjects"
}
*/

async function(args) {
  return {
    junior: [
      {bankId: 1, name: '初中语文', code: 'czyw'},
      {bankId: 2, name: '初中数学', code: 'czsx'},
      {bankId: 3, name: '初中英语', code: 'czyy'},
      {bankId: 4, name: '初中物理', code: 'czwl'},
      {bankId: 5, name: '初中化学', code: 'czhx'},
      {bankId: 6, name: '初中生物', code: 'czsw'},
      {bankId: 7, name: '初中政治', code: 'czzz'},
      {bankId: 8, name: '初中历史', code: 'czls'},
      {bankId: 9, name: '初中地理', code: 'czdl'}
    ],
    senior: [
      {bankId: 10, name: '高中语文', code: 'gzyw'},
      {bankId: 11, name: '高中数学', code: 'gzsx'},
      {bankId: 12, name: '高中英语', code: 'gzyy'},
      {bankId: 13, name: '高中物理', code: 'gzwl'},
      {bankId: 14, name: '高中化学', code: 'gzhx'},
      {bankId: 15, name: '高中生物', code: 'gzsw'},
      {bankId: 16, name: '高中政治', code: 'gzzz'},
      {bankId: 17, name: '高中历史', code: 'gzls'},
      {bankId: 18, name: '高中地理', code: 'gzdl'}
    ]
  };
}
