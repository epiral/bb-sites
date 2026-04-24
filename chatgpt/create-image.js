/* @meta
{
  "name": "chatgpt/create-image",
  "description": "ChatGPT 创建图片 (create image: prompt -> image download)",
  "domain": "chatgpt.com",
  "args": {
    "prompt": {"required": true, "description": "图片生成 prompt"},
    "promptFile": {"required": false, "description": "从文件读取超长 prompt，支持 --prompt-file"},
    "downloadPath": {"required": true, "description": "图片下载路径，支持 --download-path"},
    "timeoutMinutes": {"required": false, "description": "最长等待分钟数，默认 30"},
    "pollIntervalSeconds": {"required": false, "description": "轮询间隔秒数，默认 10"}
  },
  "capabilities": ["browser", "network", "download"],
  "readOnly": false,
  "example": "bb-browser site chatgpt/create-image --prompt \"一只橙色猫的极简图标\" --downloadPath ./cat.png"
}
*/

async function(args) {
  const prompt = args.prompt;
  const downloadPath = args.downloadPath;
  if (!prompt) return {error: 'Missing argument: prompt'};
  if (!downloadPath) return {error: 'Missing argument: downloadPath'};

  const timeoutMs = Math.max(1, Number(args.timeoutMinutes) || 30) * 60 * 1000;
  const pollMs = Math.max(5, Number(args.pollIntervalSeconds) || 10) * 1000;
  const deadline = Date.now() + timeoutMs;

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const textOf = (el) => (el?.innerText || el?.textContent || '').trim();
  const isCreateImageItem = (el) => /创建图片|Create image/i.test(textOf(el));
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
      () => [...document.querySelectorAll('[role="menuitemradio"]')].find(isCreateImageItem),
      'create image menu item',
      300,
      10000
    );
  };

  const selectCreateImage = async () => {
    let item = [...document.querySelectorAll('[role="menuitemradio"]')].find(isCreateImageItem);
    if (!item) {
      await openToolsMenu();
      item = [...document.querySelectorAll('[role="menuitemradio"]')].find(isCreateImageItem);
    }
    if (!item) throw new Error('未找到“创建图片 / Create image”菜单项');
    clickLikeUser(item);
    await sleep(1000);
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

  const isGenerating = () => [...document.querySelectorAll('button')]
    .some((button) => /停止|Stop/i.test((button.getAttribute('aria-label') || '') + ' ' + textOf(button)));

  const collectCandidateUrls = (value) => {
    const urls = new Set();
    const fileIds = new Set();
    const seen = new WeakSet();
    const visit = (item) => {
      if (typeof item === 'string') {
        for (const match of item.matchAll(/https?:\/\/[^\s"'<>\\)]+/g)) {
          const url = match[0].replace(/[),.;]+$/, '');
          if (/oaiusercontent|files\.openai|files\.oai|image|dalle|download|backend-api\/files/i.test(url)) {
            urls.add(url);
          }
        }
        for (const match of item.matchAll(/\b(file[-_][A-Za-z0-9]+)\b/g)) fileIds.add(match[1]);
        return;
      }
      if (!item || typeof item !== 'object') return;
      if (seen.has(item)) return;
      seen.add(item);
      for (const [key, nested] of Object.entries(item)) {
        if (typeof nested === 'string') {
          if (/url|href|download|src/i.test(key) && /^https?:\/\//.test(nested)) urls.add(nested);
          if (/file|asset|pointer|id/i.test(key)) {
            const fileMatch = nested.match(/\b(file[-_][A-Za-z0-9]+)\b/);
            if (fileMatch) fileIds.add(fileMatch[1]);
          }
        }
        visit(nested);
      }
    };
    visit(value);
    for (const fileId of fileIds) {
      urls.add(`/backend-api/files/${fileId}/download`);
      urls.add(`/backend-api/files/${fileId}/content`);
    }
    return [...urls];
  };

  const domImageUrls = () => [...document.images]
    .filter((image) => {
      const src = image.currentSrc || image.src || '';
      const alt = image.alt || '';
      return (image.naturalWidth >= 256 && image.naturalHeight >= 256)
        || /backend-api\/estuary\/content|已生成图片|generated image|file_/i.test(`${src} ${alt}`);
    })
    .map((image) => image.currentSrc || image.src)
    .filter((src) => src && !/avatars|googleusercontent|auth0|sprite|logo/i.test(src));

  const blobToDataUrl = (blob) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

  const extensionForMime = (mimeType) => {
    if (/png/i.test(mimeType)) return 'png';
    if (/jpe?g/i.test(mimeType)) return 'jpg';
    if (/webp/i.test(mimeType)) return 'webp';
    return 'png';
  };

  const fetchImage = async (url) => {
    const headers = await authHeaders();
    const response = await fetch(url, {credentials: 'include', headers});
    if (!response.ok) return null;
    const blob = await response.blob();
    const mimeType = blob.type || response.headers.get('content-type') || '';
    if (!/^image\//i.test(mimeType) || blob.size < 1000) return null;
    const dataUrl = await blobToDataUrl(blob);
    return {
      sourceUrl: new URL(url, location.origin).href,
      mimeType,
      dataUrl,
      fileName: `chatgpt-image.${extensionForMime(mimeType)}`
    };
  };

  const tryExtractImage = async (conversationId) => {
    const candidates = new Set(domImageUrls());
    let conversation = null;
    if (conversationId) {
      conversation = await fetchConversation(conversationId);
      for (const url of collectCandidateUrls(conversation)) candidates.add(url);
    }
    for (const url of candidates) {
      try {
        const image = await fetchImage(url);
        if (image) {
          return {
            ...image,
            title: conversation?.title || document.title || 'ChatGPT image'
          };
        }
      } catch {}
    }
    return null;
  };

  let conversationId = null;
  try {
    const beforeIds = new Set((await getHistory()).map((item) => item.id));
    await openNewConversation();
    await clearComposerModes();
    await selectCreateImage();
    await fillPrompt();
    const startedAt = Date.now();
    await sendPrompt();

    let lastError = null;
    while (Date.now() < deadline) {
      try {
        conversationId = conversationId || await findNewConversationId(beforeIds, startedAt);
        const image = await tryExtractImage(conversationId);
        if (image) {
          return {
            conversationId,
            conversationUrl: conversationId ? `https://chatgpt.com/c/${conversationId}` : location.href,
            status: 'completed',
            sourceUrl: image.sourceUrl,
            _bbBrowserDownload: {
              path: downloadPath,
              fileName: image.fileName,
              mimeType: image.mimeType,
              dataUrl: image.dataUrl
            }
          };
        }
      } catch (error) {
        lastError = error?.message || String(error);
      }
      if (!isGenerating() && Date.now() - startedAt > 30000) {
        conversationId = conversationId || await findNewConversationId(beforeIds, startedAt);
      }
      await sleep(pollMs);
    }
    throw new Error(`创建图片等待超时${lastError ? `，最后错误: ${lastError}` : ''}`);
  } catch (error) {
    return {
      error: error?.message || String(error),
      conversationId,
      conversationUrl: conversationId ? `https://chatgpt.com/c/${conversationId}` : undefined,
      hint: '请确认 chatgpt.com 已登录且当前账号可使用创建图片；长任务可通过 --timeoutMinutes 增大等待时间。',
      action: 'bb-browser open https://chatgpt.com'
    };
  }
}
