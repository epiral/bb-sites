/* @meta
{
  "name": "chatgpt/deep-research",
  "description": "ChatGPT 深度研究 (deep research: prompt -> markdown report download)",
  "domain": "chatgpt.com",
  "args": {
    "prompt": {"required": true, "description": "深度研究 prompt"},
    "promptFile": {"required": false, "description": "从文件读取超长 prompt，支持 --prompt-file"},
    "downloadPath": {"required": true, "description": "Markdown 下载路径，支持 --download-path"},
    "timeoutMinutes": {"required": false, "description": "最长等待分钟数，默认 30"},
    "pollIntervalSeconds": {"required": false, "description": "轮询间隔秒数，默认 15"}
  },
  "capabilities": ["browser", "network", "download"],
  "readOnly": false,
  "example": "bb-browser site chatgpt/deep-research --prompt \"调研 2025 年美国 CPI 走势\" --downloadPath ./report.md"
}
*/

async function(args) {
  const prompt = args.prompt;
  const downloadPath = args.downloadPath;
  if (!prompt) return {error: 'Missing argument: prompt'};
  if (!downloadPath) return {error: 'Missing argument: downloadPath'};

  const timeoutMs = Math.max(1, Number(args.timeoutMinutes) || 30) * 60 * 1000;
  const pollMs = Math.max(5, Number(args.pollIntervalSeconds) || 15) * 1000;
  const deadline = Date.now() + timeoutMs;

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const textOf = (el) => (el?.innerText || el?.textContent || '').trim();
  const isDeepResearchItem = (el) => /深度研究|Deep research/i.test(textOf(el));
  const clickLikeUser = (el) => {
    if (!el) return false;
    el.scrollIntoView?.({block: 'center', inline: 'center'});
    for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
      const EventClass = type.startsWith('pointer') ? PointerEvent : MouseEvent;
      el.dispatchEvent(new EventClass(type, {
        bubbles: true,
        cancelable: true,
        pointerId: 1,
        pointerType: 'mouse',
        button: 0,
        buttons: type.endsWith('down') ? 1 : 0
      }));
    }
    return true;
  };

  const waitFor = async (predicate, label, intervalMs = 300, maxMs = 30000) => {
    const end = Date.now() + maxMs;
    while (Date.now() < end) {
      const value = predicate();
      if (value) return value;
      await sleep(intervalMs);
    }
    throw new Error(`Timed out waiting for ${label}`);
  };

  const getAccessToken = async () => {
    const response = await fetch('/api/auth/session', {credentials: 'include'});
    if (!response.ok) throw new Error(`无法读取 ChatGPT session: HTTP ${response.status}`);
    const session = await response.json();
    if (!session.accessToken) throw new Error('ChatGPT session missing accessToken; 请先在浏览器登录 chatgpt.com');
    return session.accessToken;
  };

  const authHeaders = async () => ({authorization: `Bearer ${await getAccessToken()}`});

  const getHistory = async () => {
    const response = await fetch('/backend-api/conversations?offset=0&limit=20', {
      credentials: 'include',
      headers: await authHeaders()
    });
    if (!response.ok) throw new Error(`读取会话列表失败: HTTP ${response.status}`);
    const data = await response.json();
    return Array.isArray(data.items) ? data.items : [];
  };

  const fetchConversation = async (conversationId) => {
    const response = await fetch(`/backend-api/conversation/${conversationId}`, {
      credentials: 'include',
      headers: await authHeaders()
    });
    if (!response.ok) throw new Error(`读取会话失败: HTTP ${response.status}`);
    return response.json();
  };

  const openNewConversation = async () => {
    const newChat = [...document.querySelectorAll('a,button')].find((el) =>
      (el.getAttribute('href') === '/' && /新聊天|New chat/i.test(textOf(el)))
      || /新聊天|New chat/i.test(el.getAttribute('aria-label') || '')
    );
    if (newChat) clickLikeUser(newChat);
    await waitFor(() => location.hostname.endsWith('chatgpt.com') && location.pathname === '/', 'new ChatGPT page', 500, 30000);
    await waitFor(() => document.querySelector('#prompt-textarea'), 'composer', 500, 60000);
    await sleep(1000);
  };

  const clearComposerModes = async () => {
    for (let round = 0; round < 4; round++) {
      const active = [...document.querySelectorAll('button')]
        .filter((button) => /点击以重试|click to retry/i.test(button.getAttribute('aria-label') || ''));
      if (active.length === 0) return;
      for (const button of active) clickLikeUser(button);
      await sleep(500);
    }
  };

  const openToolsMenu = async () => {
    const plusButton = await waitFor(
      () => document.querySelector('#composer-plus-btn')
        || [...document.querySelectorAll('button')].find((button) => /添加文件|Add files/i.test(button.getAttribute('aria-label') || '')),
      'composer plus button',
      300,
      30000
    );
    clickLikeUser(plusButton);
    return waitFor(
      () => [...document.querySelectorAll('[role="menuitemradio"]')].find(isDeepResearchItem),
      'deep research menu item',
      300,
      10000
    );
  };

  const selectDeepResearch = async () => {
    let item = [...document.querySelectorAll('[role="menuitemradio"]')].find(isDeepResearchItem);
    if (!item) {
      await openToolsMenu();
      item = [...document.querySelectorAll('[role="menuitemradio"]')].find(isDeepResearchItem);
    }
    if (!item) throw new Error('未找到“深度研究 / Deep research”菜单项');
    clickLikeUser(item);
    await sleep(800);
  };

  const fillPrompt = async () => {
    const editor = await waitFor(() => document.querySelector('#prompt-textarea'), 'prompt editor', 300, 30000);
    editor.focus();
    document.execCommand('selectAll', false, null);
    document.execCommand('insertText', false, prompt);
    await sleep(500);
    if (!textOf(editor).includes(prompt.slice(0, Math.min(24, prompt.length)))) {
      throw new Error('写入 prompt 失败');
    }
  };

  const sendPrompt = async () => {
    const sendButton = await waitFor(
      () => document.querySelector('#composer-submit-button,[data-testid="send-button"]')
        || [...document.querySelectorAll('button')].find((button) => /发送提示|Send prompt|Send/i.test((button.getAttribute('aria-label') || '') + ' ' + textOf(button)) && !button.disabled),
      'send button',
      300,
      30000
    );
    if (sendButton.disabled) throw new Error('发送按钮不可用');
    clickLikeUser(sendButton);
    await sleep(1500);
  };

  const currentConversationId = () => {
    const match = location.pathname.match(/\/c\/([0-9a-f-]+)/i);
    return match ? match[1] : null;
  };

  const findNewConversationId = async (beforeIds, startedAt) => {
    const byUrl = currentConversationId();
    if (byUrl && !beforeIds.has(byUrl)) return byUrl;
    const items = await getHistory();
    const candidates = items.filter((item) => {
      const created = item.create_time ? Date.parse(item.create_time) : 0;
      return !beforeIds.has(item.id) && (!created || created >= startedAt - 120000);
    });
    return candidates[0]?.id || byUrl;
  };

  const parseMaybeJson = (value) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    if (!trimmed || !/^[{[]/.test(trimmed)) return value;
    try { return JSON.parse(trimmed); } catch { return value; }
  };

  const collectDeepResearchState = (conversation) => {
    let status = null;
    let report = null;
    let lastUpdatedAt = null;
    const researchStatuses = new Set([
      'completed',
      'researching',
      'waiting_for_user_response_on_plan',
      'failed',
      'error',
      'cancelled'
    ]);
    const setStatus = (candidate, owner) => {
      if (typeof candidate !== 'string') return;
      const looksLikeResearchState = Boolean(
        owner?.report_message !== undefined
        || owner?.research_started_at
        || owner?.research_stopped_at
        || owner?.last_updated_at
        || owner?.waiting_for_user_response_on_plan_until
        || owner?.step_statuses_by_plan
      );
      if (looksLikeResearchState && researchStatuses.has(candidate)) {
        status = candidate;
      } else if (!status) {
        status = candidate;
      }
    };
    const seen = new WeakSet();
    const visit = (value) => {
      value = parseMaybeJson(value);
      if (!value || typeof value !== 'object') return;
      if (seen.has(value)) return;
      seen.add(value);
      setStatus(value.status, value);
      if (typeof value.last_updated_at === 'string') lastUpdatedAt = value.last_updated_at;
      if (value.report_message !== undefined && report === null) report = value.report_message;
      for (const nested of Object.values(value)) visit(nested);
    };
    visit(conversation);
    const normalizeReport = (value) => {
      value = parseMaybeJson(value);
      if (typeof value === 'string') return value;
      if (!value || typeof value !== 'object') return null;
      if (Array.isArray(value.content?.parts) && typeof value.content.parts[0] === 'string') {
        return value.content.parts.join('\n\n');
      }
      if (typeof value.content?.text === 'string') return value.content.text;
      if (typeof value.content === 'string') return value.content;
      for (const key of ['markdown', 'content', 'text', 'message', 'body']) {
        if (typeof value[key] === 'string') return value[key];
      }
      return JSON.stringify(value, null, 2);
    };
    return {status, report: normalizeReport(report), lastUpdatedAt};
  };

  const waitForReport = async (conversationId) => {
    let lastStatus = 'submitted';
    while (Date.now() < deadline) {
      const conversation = await fetchConversation(conversationId);
      const state = collectDeepResearchState(conversation);
      lastStatus = state.status || lastStatus;
      if (state.report) {
        return {
          title: conversation.title || 'ChatGPT Deep Research',
          markdown: state.report,
          status: state.status || 'completed',
          lastUpdatedAt: state.lastUpdatedAt
        };
      }
      await sleep(pollMs);
    }
    throw new Error(`深度研究等待超时，最后状态: ${lastStatus}`);
  };

  let conversationId = null;
  try {
    const beforeIds = new Set((await getHistory()).map((item) => item.id));
    await openNewConversation();
    await clearComposerModes();
    await selectDeepResearch();
    await fillPrompt();
    const startedAt = Date.now();
    await sendPrompt();

    while (Date.now() < deadline && !conversationId) {
      conversationId = await findNewConversationId(beforeIds, startedAt);
      if (!conversationId) await sleep(2000);
    }
    if (!conversationId) throw new Error('提交后未能定位新会话 ID');

    const report = await waitForReport(conversationId);
    const markdown = report.markdown.startsWith('#')
      ? report.markdown
      : `# ${report.title}\n\n${report.markdown}`;

    return {
      conversationId,
      conversationUrl: `https://chatgpt.com/c/${conversationId}`,
      status: report.status,
      lastUpdatedAt: report.lastUpdatedAt,
      _bbBrowserDownload: {
        path: downloadPath,
        fileName: 'chatgpt-deep-research.md',
        mimeType: 'text/markdown; charset=utf-8',
        text: markdown
      }
    };
  } catch (error) {
    return {
      error: error?.message || String(error),
      conversationId,
      conversationUrl: conversationId ? `https://chatgpt.com/c/${conversationId}` : undefined,
      hint: '请确认 chatgpt.com 已登录且当前账号可使用深度研究；长任务可通过 --timeoutMinutes 增大等待时间。',
      action: 'bb-browser open https://chatgpt.com'
    };
  }
}
