/* @meta
{
  "name": "douyin/search",
  "description": "Search public Douyin results",
  "domain": "www.douyin.com",
  "args": {
    "query": {"required": true, "description": "Search query"},
    "tab": {"required": false, "description": "Result tab: general (default) or video"},
    "count": {"required": false, "description": "Number of results (default 10, max 20)"}
  },
  "readOnly": true,
  "example": "bb-browser site douyin/search AI video 5"
}
*/

async function(args) {
  if (!args.query) return { error: 'Missing argument: query' };

  var query = String(args.query).trim();
  var rawTab = args.tab;
  var rawCount = args.count;
  var tabLike = { general: true, video: true };

  if (tabLike[String(rawCount || '').trim().toLowerCase()]) {
    rawTab = rawCount;
    rawCount = args.tab;
  }

  if (/^\d+$/.test(String(rawTab || '').trim()) && !rawCount) {
    rawCount = rawTab;
    rawTab = '';
  }

  var limit = Math.min(Math.max(parseInt(rawCount, 10) || 10, 1), 20);
  var tab = String(rawTab || 'general').trim().toLowerCase();

  if (tab !== 'general' && tab !== 'video') {
    return { error: 'Invalid tab', hint: 'Use general or video.' };
  }

  function sleep(ms) {
    return new Promise(function(resolve) { setTimeout(resolve, ms); });
  }

  function cleanInline(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
  }

  function cleanBlock(text) {
    return String(text || '')
      .replace(/\u00a0/g, ' ')
      .replace(/\r/g, '')
      .split('\n')
      .map(function(line) { return line.trim(); })
      .filter(Boolean)
      .join('\n');
  }

  function isDurationToken(text) {
    return /^\d{1,2}:\d{2}(?::\d{2})?(?:\/\d{1,2}:\d{2}(?::\d{2})?)?$/.test(String(text || '').trim());
  }

  function normalizeDurationToken(text) {
    var value = String(text || '').trim();
    if (!value) return '';
    if (value.indexOf('/') !== -1) {
      var parts = value.split('/');
      return parts[parts.length - 1].trim();
    }
    return value;
  }

  function isCountToken(text) {
    return /^\d+(?:\.\d+)?(?:万|亿)?$/.test(text);
  }

  function parseCount(raw) {
    if (!raw) return null;
    var text = String(raw).trim();
    if (!text) return null;
    if (text.slice(-1) === '亿') return Math.round(parseFloat(text.slice(0, -1)) * 100000000);
    if (text.slice(-1) === '万') return Math.round(parseFloat(text.slice(0, -1)) * 10000);
    var num = parseFloat(text);
    return isNaN(num) ? null : Math.round(num);
  }

  function isDateToken(text) {
    return /^·?\s*(\d{1,2}月\d{1,2}日|\d{4}年\d{1,2}月\d{1,2}日|\d+分钟前|\d+小时前|\d+天前|\d+周前|\d+月前|\d+年前|昨天|前天)$/.test(String(text || '').trim());
  }

  function isStructuralToken(text) {
    var token = String(text || '').trim();
    if (!token) return true;
    if (token === '图文' || token === '合集' || token === '问问AI') return true;
    if (token === '搜索' || token === '筛选' || token === '相关搜索') return true;
    if (isDurationToken(token) || isCountToken(token) || isDateToken(token)) return true;
    return false;
  }

  function isElementVisible(el) {
    if (!el) return false;
    var style = window.getComputedStyle(el);
    if (!style) return true;
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    if (el.getAttribute('aria-hidden') === 'true') return false;
    return true;
  }

  function getSearchInput() {
    var inputs = Array.from(document.querySelectorAll('input'));
    for (var i = 0; i < inputs.length; i++) {
      var input = inputs[i];
      var placeholder = cleanInline(input.getAttribute('placeholder'));
      if (placeholder.indexOf('搜索') !== -1 && isElementVisible(input)) return input;
    }
    return null;
  }

  function getSearchButton() {
    var buttons = Array.from(document.querySelectorAll('button'));
    for (var i = 0; i < buttons.length; i++) {
      if (cleanInline(buttons[i].innerText) === '搜索' && isElementVisible(buttons[i])) return buttons[i];
    }
    return null;
  }

  function setInputValue(input, value) {
    if (!input) return;
    var descriptor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
    if (descriptor && descriptor.set) descriptor.set.call(input, value);
    else input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function findExactTextElement(label) {
    var candidates = Array.from(document.querySelectorAll('span, button, div'));
    for (var i = 0; i < candidates.length; i++) {
      var el = candidates[i];
      if (!isElementVisible(el)) continue;
      if (cleanInline(el.innerText) === label) return el;
    }
    return null;
  }

  async function waitFor(fn, timeoutMs, intervalMs) {
    var timeout = timeoutMs || 8000;
    var interval = intervalMs || 200;
    var start = Date.now();
    while (Date.now() - start < timeout) {
      var value = fn();
      if (value) return value;
      await sleep(interval);
    }
    return null;
  }

  async function ensureSearchResults() {
    var input = getSearchInput();
    var button = getSearchButton();

    if (!input || !button) {
      return location.pathname.indexOf('/search/') !== -1;
    }

    setInputValue(input, query);
    button.click();

    await waitFor(function() {
      var decodedHref = '';
      try {
        decodedHref = decodeURIComponent(location.href);
      } catch (e) {
        decodedHref = location.href;
      }
      return decodedHref.indexOf('/search/') !== -1 && decodedHref.indexOf(query) !== -1;
    }, 6000, 200);

    return true;
  }

  async function switchTabIfNeeded() {
    var label = tab === 'video' ? '视频' : '综合';
    var el = findExactTextElement(label);
    if (!el) return;
    el.click();
    await sleep(1200);
  }

  function getMetaNodes() {
    return Array.from(document.querySelectorAll('div')).filter(function(el) {
      if (!isElementVisible(el)) return false;
      var text = cleanBlock(el.innerText);
      if (!text || text.charAt(0) !== '@') return false;
      if (text.indexOf('\n· ') === -1) return false;
      var lines = text.split('\n');
      return lines.length === 2 && lines[0].length > 1;
    });
  }

  function parseCards() {
    var seen = {};
    var cards = [];
    var nodes = getMetaNodes();

    for (var i = 0; i < nodes.length; i++) {
      var meta = nodes[i];
      var card = meta;

      for (var hop = 0; hop < 3 && card && card.parentElement; hop++) {
        card = card.parentElement;
      }

      if (!card) continue;

      var lines = cleanBlock(card.innerText).split('\n').filter(Boolean);
      var authorIndex = -1;

      for (var j = 0; j < lines.length; j++) {
        if (lines[j].charAt(0) === '@') {
          authorIndex = j;
          break;
        }
      }

      if (authorIndex < 1) continue;

      var author = lines[authorIndex].replace(/^@\s*/, '').trim();
      var publishedAt = '';

      if (authorIndex + 1 < lines.length && lines[authorIndex + 1].indexOf('·') === 0) {
        publishedAt = lines[authorIndex + 1].replace(/^·\s*/, '').trim();
      }

      var before = lines.slice(0, authorIndex);
      var title = before.length ? before[before.length - 1] : '';
      var prefixTokens = before.slice(0, -1);
      var likesRaw = '';
      var duration = '';
      var typeTag = '';

      for (var k = 0; k < prefixTokens.length; k++) {
        var token = prefixTokens[k];
        if (token === '图文') {
          typeTag = 'image';
          continue;
        }
        if (isDurationToken(token)) {
          duration = normalizeDurationToken(token);
          continue;
        }
        if (isCountToken(token)) {
          likesRaw = token;
        }
      }

      if (!typeTag && duration) typeTag = 'video';
      if (!typeTag) typeTag = 'unknown';

      if (!title || title === '图文' || isDurationToken(title) || isCountToken(title)) continue;

      var key = [author, publishedAt, likesRaw, title].join('|');
      if (seen[key]) continue;
      seen[key] = true;

      cards.push({
        title: title,
        author: author,
        published_at: publishedAt || undefined,
        type: typeTag,
        duration: duration || undefined,
        likes_raw: likesRaw || undefined,
        likes: parseCount(likesRaw)
      });
    }

    return cards;
  }

  function parseTextCards() {
    var lines = cleanBlock(document.body.innerText).split('\n').filter(Boolean);
    var seen = {};
    var cards = [];

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (!line || line.charAt(0) !== '@') continue;
      if (!isDateToken(lines[i + 1] || '')) continue;

      var author = line.replace(/^@\s*/, '').trim();
      var publishedAt = String(lines[i + 1] || '').replace(/^·\s*/, '').trim();
      var titleIndex = i - 1;

      while (titleIndex >= 0 && (isDurationToken(lines[titleIndex]) || isCountToken(lines[titleIndex]) || lines[titleIndex] === '图文' || lines[titleIndex] === '合集')) {
        titleIndex--;
      }

      if (titleIndex < 0) continue;

      var title = lines[titleIndex];
      if (!title || title === '搜索' || title === '筛选' || title === '相关搜索') continue;

      var tokens = [];
      for (var j = titleIndex - 1; j >= 0 && titleIndex - j <= 4; j--) {
        var token = lines[j];
        if (isDurationToken(token) || isCountToken(token) || token === '图文' || token === '合集') {
          tokens.unshift(token);
          continue;
        }
        break;
      }

      var likesRaw = '';
      var duration = '';
      var typeTag = '';
      var badges = [];

      for (var k = 0; k < tokens.length; k++) {
        var metaToken = tokens[k];
        if (metaToken === '图文') {
          typeTag = 'image';
          badges.push(metaToken);
          continue;
        }
        if (metaToken === '合集') {
          badges.push(metaToken);
          continue;
        }
        if (isDurationToken(metaToken)) {
          duration = normalizeDurationToken(metaToken);
          continue;
        }
        if (isCountToken(metaToken)) {
          likesRaw = metaToken;
        }
      }

      if (!typeTag && duration) typeTag = 'video';
      if (!typeTag) typeTag = 'unknown';

      var key = [author, publishedAt, likesRaw, title].join('|');
      if (seen[key]) continue;
      seen[key] = true;

      cards.push({
        title: title,
        author: author,
        published_at: publishedAt || undefined,
        type: typeTag,
        duration: duration || undefined,
        likes_raw: likesRaw || undefined,
        likes: parseCount(likesRaw),
        badges: badges.length ? badges : undefined
      });
    }

    return cards;
  }

  // Douyin general search often renders author names without the @ prefix used by the video layout.
  function parseGeneralCards() {
    var lines = cleanBlock(document.body.innerText).split('\n').filter(Boolean);
    var seen = {};
    var cards = [];

    for (var i = 1; i < lines.length; i++) {
      var dateToken = lines[i];
      var authorToken = lines[i - 1];

      if (!isDateToken(dateToken)) continue;
      if (!authorToken || authorToken.charAt(0) === '@') continue;
      if (isStructuralToken(authorToken)) continue;

      var author = cleanInline(authorToken);
      var publishedAt = String(dateToken || '').replace(/^·\s*/, '').trim();
      var j = i + 1;
      var captionParts = [];
      var likesRaw = '';
      var duration = '';
      var typeTag = '';
      var badges = [];

      while (j < lines.length) {
        var token = lines[j];
        var next = lines[j + 1] || '';

        if (!token) {
          j++;
          continue;
        }

        if (!token.startsWith('@') && !isStructuralToken(token) && isDateToken(next)) {
          break;
        }

        if (token === '...展开') {
          j++;
          continue;
        }

        if (token === '图文') {
          typeTag = 'image';
          badges.push(token);
          j++;
          continue;
        }

        if (token === '合集') {
          badges.push(token);
          j++;
          continue;
        }

        if (isDurationToken(token)) {
          duration = normalizeDurationToken(token);
          j++;
          continue;
        }

        if (isCountToken(token)) {
          if (!likesRaw) likesRaw = token;
          j++;
          continue;
        }

        captionParts.push(token);
        j++;
      }

      var title = cleanInline(captionParts.join(' '));
      if (!title || title === author) continue;

      if (!typeTag && duration) typeTag = 'video';
      if (!typeTag) typeTag = 'unknown';

      var key = [author, publishedAt, likesRaw, title].join('|');
      if (seen[key]) continue;
      seen[key] = true;

      cards.push({
        title: title,
        author: author,
        published_at: publishedAt || undefined,
        type: typeTag,
        duration: duration || undefined,
        likes_raw: likesRaw || undefined,
        likes: parseCount(likesRaw),
        badges: badges.length ? badges : undefined
      });
    }

    return cards;
  }

  function collectResults() {
    var merged = [];
    var seen = {};
    var groups = [parseCards(), parseTextCards(), parseGeneralCards()];

    for (var g = 0; g < groups.length; g++) {
      for (var i = 0; i < groups[g].length; i++) {
        var item = groups[g][i];
        var key = [item.author, item.published_at || '', item.likes_raw || '', item.title].join('|');
        if (seen[key]) continue;
        seen[key] = true;
        merged.push(item);
      }
    }

    return merged;
  }

  if (location.hostname.indexOf('douyin.com') === -1) {
    return { error: 'Not on Douyin', hint: 'Open any https://www.douyin.com page first.' };
  }

  await ensureSearchResults();
  await switchTabIfNeeded();

  var results = await waitFor(function() {
    var cards = collectResults();
    return cards.length ? cards : null;
  }, 10000, 250);

  if (!results || !results.length) {
    return {
      error: 'No public results captured',
      hint: 'Open a public Douyin search page first. Guest mode usually works for general/video, but user search often returns empty.'
    };
  }

  return {
    query: query,
    tab: tab,
    count: Math.min(results.length, limit),
    results: results.slice(0, limit)
  };
}
