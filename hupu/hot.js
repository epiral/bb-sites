/* @meta
{
  "name": "hupu/hot",
  "description": "虎扑热帖 (Hupu hot posts: title, replies, forum)",
  "domain": "bbs.hupu.com",
  "args": {},
  "readOnly": true,
  "example": "bb-browser site hupu/hot"
}
*/

async function(args) {
  const resp = await fetch('https://bbs.hupu.com/all-gambia');
  if (!resp.ok) return {error: 'HTTP ' + resp.status};
  const html = await resp.text();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const items = [...doc.querySelectorAll('.list-item-wrap')].map((wrap, i) => {
    const link = wrap.querySelector('.t-info > a');
    const titleEl = wrap.querySelector('.t-title');
    const lightsEl = wrap.querySelector('.t-lights');
    const repliesEl = wrap.querySelector('.t-replies');
    const labelEl = wrap.querySelector('.t-label a');
    if (!link || !titleEl) return null;
    const href = link.getAttribute('href') || '';
    const tid = href.replace(/\D/g, '');
    const lights = parseInt((lightsEl?.textContent || '').replace(/\D/g, '')) || 0;
    const replies = parseInt((repliesEl?.textContent || '').replace(/\D/g, '')) || 0;
    const isHot = (link.className || '').includes('hot');
    return {
      rank: i + 1,
      tid,
      title: titleEl.textContent.trim(),
      url: 'https://bbs.hupu.com' + href,
      lights,
      replies,
      isHot,
      forum: labelEl?.textContent.trim() || ''
    };
  }).filter(Boolean);
  return {count: items.length, items};
}
