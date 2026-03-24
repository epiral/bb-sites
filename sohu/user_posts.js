/* @meta
{
  "name": "sohu/user_posts",
  "description": "获取搜狐号用户近期发布文章列表（自动滚动加载，直到满足日期截止或到底）",
  "domain": "mp.sohu.com",
  "args": {
    "xpt": {"required": true, "description": "用户 xpt 标识（从 URL ?xpt= 参数中提取）"},
    "days": {"required": false, "description": "获取最近 N 天内的文章（默认 90）"}
  },
  "readOnly": true,
  "example": "bb-browser site sohu/user_posts MzEwNzhiYTEtYTZjNy00ZjMxLTk4YTUtMmQzYzNlODc0NjA4"
}
*/

async function(args) {
  // 兼容完整 URL 或纯 xpt：bb-browser site sohu/user_posts <url_or_xpt>
  const raw = args.xpt || '';
  const xptFromUrl = raw.match(/[?&]xpt=([^&]+)/)?.[1];
  args.xpt = xptFromUrl ? decodeURIComponent(xptFromUrl) : raw;
  if (!args.xpt) return {error: 'Missing argument: xpt'};
  const days = parseInt(args.days) || 90;

  // 等待页面稳定，读取当前页面实际 xpt
  await new Promise(r => setTimeout(r, 1500));
  const currentXpt = new URLSearchParams(location.search).get('xpt');
  // 使用当前页面的实际 xpt（collect.js 已通过 bbOpen 确保页面正确）
  // 单独命令行调用时，请先执行 bb-browser open <url> 再执行此命令
  const effectiveXpt = currentXpt || args.xpt;

  // 解析时间文本 → "YYYY-MM-DD"
  function parseDate(text) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const pad = n => String(n).padStart(2, '0');
    const fmt = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
    if (!text) return null;
    if (text.includes('小时前') || text.includes('分钟前') || text.includes('刚刚')) {
      return fmt(today);
    }
    if (text.includes('昨天')) {
      const d = new Date(today); d.setDate(d.getDate() - 1);
      return fmt(d);
    }
    if (text.includes('前天')) {
      const d = new Date(today); d.setDate(d.getDate() - 2);
      return fmt(d);
    }
    const nDays = text.match(/(\d+)天前/);
    if (nDays) {
      const d = new Date(today); d.setDate(d.getDate() - parseInt(nDays[1]));
      return fmt(d);
    }
    const m = text.match(/(\d{4})\.(\d{2})\.(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    return null;
  }

  // 计算截止日期字符串（YYYY-MM-DD）
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const pad = n => String(n).padStart(2, '0');
  const cutoffStr = `${cutoff.getFullYear()}-${pad(cutoff.getMonth()+1)}-${pad(cutoff.getDate())}`;

  // 滚动循环：加载文章直到停止条件
  const seenIds = new Set();
  let reachedEnd = false;
  let noNewCount = 0;

  while (true) {
    const prevSize = seenIds.size;
    let hitCutoff = false;

    for (const card of document.querySelectorAll('.TPLImageTextFeedItem')) {
      const a = card.querySelector('a[href*="sohu.com/a/"]');
      if (!a) continue;
      const match = a.href.match(/sohu\.com\/a\/(\d+)/);
      if (!match || seenIds.has(match[1])) continue;

      const extraItems = [...(card.querySelector('.extra-info-list')?.querySelectorAll('.extra-info-item') || [])]
        .map(el => el.textContent.trim());
      const dateStr = parseDate(extraItems[0] || '');

      if (dateStr && dateStr < cutoffStr) { hitCutoff = true; break; }
      seenIds.add(match[1]);
    }

    if (hitCutoff) break;
    if (document.body.innerText.includes('暂无更多内容')) { reachedEnd = true; break; }

    if (seenIds.size === prevSize) {
      noNewCount++;
      if (noNewCount >= 2) { reachedEnd = true; break; }
    } else {
      noNewCount = 0;
    }

    window.scrollBy(0, 3000);
    await new Promise(r => setTimeout(r, 1500));
  }

  // 二次遍历：提取完整字段（按 DOM 顺序，遇到超期截止）
  const articles = [];
  const seenFinal = new Set();

  for (const card of document.querySelectorAll('.TPLImageTextFeedItem')) {
    const a = card.querySelector('a[href*="sohu.com/a/"]');
    if (!a) continue;
    const match = a.href.match(/sohu\.com\/a\/(\d+)_(\d+)/);
    if (!match || seenFinal.has(match[1])) continue;

    const extraItems = [...(card.querySelector('.extra-info-list')?.querySelectorAll('.extra-info-item') || [])]
      .map(el => el.textContent.trim());
    const publishedAt = parseDate(extraItems[0] || '');
    if (publishedAt && publishedAt < cutoffStr) break;

    seenFinal.add(match[1]);

    const title = (card.querySelector('.item-text-content-title')?.textContent || '')
      .replace(/\s+/g, ' ').trim().slice(0, 100);
    const img = a.querySelector('img');
    const cover = (img?.src || img?.dataset?.src || '').replace(/^\/\//, 'https://');
    const reads = parseInt(extraItems[1]) || 0;
    const comments = parseInt(extraItems[2]) || 0;

    articles.push({
      id: match[1],
      title,
      url: 'https://www.sohu.com/a/' + match[1] + '_' + match[2],
      cover,
      published_at: publishedAt,
      reads,
      comments,
    });
  }

  return {
    xpt: effectiveXpt,
    days,
    reached_end: reachedEnd,
    count: articles.length,
    articles,
  };
}
