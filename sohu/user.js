/* @meta
{
  "name": "sohu/user",
  "description": "获取搜狐号用户资料（头像、名称、简介、粉丝数、关注数）",
  "domain": "mp.sohu.com",
  "args": {
    "xpt": {"required": true, "description": "用户 xpt 标识（从 URL ?xpt= 参数中提取）"}
  },
  "readOnly": true,
  "example": "bb-browser site sohu/user MzEwNzhiYTEtYTZjNy00ZjMxLTk4YTUtMmQzYzNlODc0NjA4"
}
*/

async function(args) {
  // 兼容完整 URL 或纯 xpt：bb-browser site sohu/user <url_or_xpt>
  const raw = args.xpt || '';
  const xptFromUrl = raw.match(/[?&]xpt=([^&]+)/)?.[1];
  args.xpt = xptFromUrl ? decodeURIComponent(xptFromUrl) : raw;
  if (!args.xpt) return {error: 'Missing argument: xpt', hint: 'Pass a full URL or bare xpt string'};

  // 从 window.blockRenderData 提取 BriefIntroductionCard 数据（SSR 渲染，无需额外请求）
  const brd = window.blockRenderData || {};
  const cardKey = Object.keys(brd).find(k => k.startsWith('BriefIntroductionCard'));
  if (!cardKey) {
    // fallback: 从 window.contentData 提取基础信息
    const cd = window.contentData;
    if (!cd || !cd.account) return {error: 'Could not find user data', hint: 'Make sure the page is fully loaded'};
    return {
      xpt: args.xpt,
      name: cd.account.nickName || cd.title || '',
      avatar: (cd.account.avatar || '').replace(/^\/\//, 'https://'),
      description: cd.brief || '',
      followers: null,
      following: null,
      article_count: null,
      media_id: String(cd.account.id || ''),
      verified_tag: '',
      profile_url: 'https://mp.sohu.com/profile?xpt=' + args.xpt
    };
  }

  const card = brd[cardKey];
  const u = card?.param?.data?.list?.[0];
  if (!u) return {error: 'BriefIntroductionCard data missing', hint: 'Page may not have loaded completely'};

  // 头像 URL 补全协议
  const fixUrl = (url) => url ? (url.startsWith('//') ? 'https:' + url : url) : '';

  return {
    xpt: args.xpt,
    name: u.title || '',
    avatar: fixUrl(u.column_2_image || ''),
    description: u.column_9_text || '',
    reads: u.column_3_text || 0,      // 阅读数（搜狐无粉丝数）
    subscribes: u.column_15_text || 0, // 订阅数
    likes: u.column_16_text || 0,      // 获赞数
    article_count: u.column_5_text || 0,
    verified_tag: u.column_7_text || '',
    media_id: String(u.id || ''),
    profile_url: 'https://mp.sohu.com/profile?xpt=' + args.xpt
  };
}
