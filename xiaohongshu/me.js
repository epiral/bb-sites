/* @meta
{
  "name": "xiaohongshu/me",
  "description": "Get current logged-in Xiaohongshu user",
  "domain": "www.xiaohongshu.com",
  "args": {},
  "capabilities": ["network"],
  "readOnly": true
}
*/

async function(args) {
  const helper = globalThis.__bbBrowserXhsHelper || (globalThis.__bbBrowserXhsHelper = (() => {
    function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
    function getApp() { return document.querySelector("#app")?.__vue_app__ || null; }
    function getGlobals() { return getApp()?.config?.globalProperties || null; }
    function getPinia() { return getGlobals()?.$pinia || null; }
    function getRouter() { return getGlobals()?.$router || null; }
    function getStore(name) { return getPinia()?._s?.get(name) || null; }
    function toPlain(value) { try { return JSON.parse(JSON.stringify(value)); } catch { return value ?? null; } }
    async function waitFor(predicate, timeoutMs = 8000, intervalMs = 250) {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        try {
          const result = await predicate();
          if (result) return result;
        } catch {}
        await sleep(intervalMs);
      }
      return null;
    }
    function withTimeout(promise, timeoutMs, message) {
      return Promise.race([
        promise,
        sleep(timeoutMs).then(() => { throw new Error(message); })
      ]);
    }
    function normalizeUser(user) {
      if (!user || typeof user !== "object") return null;
      const nickname = user.nickname ?? user.name ?? user.nickName ?? null;
      const userId = user.userId ?? user.user_id ?? user.userid ?? user.id ?? null;
      const redId = user.redId ?? user.red_id ?? user.redid ?? null;
      const desc = user.desc ?? user.description ?? null;
      const gender = user.gender ?? null;
      if (!nickname && !userId && !redId) return null;
      return {
        nickname,
        red_id: redId,
        desc,
        gender,
        userid: userId,
        url: userId ? `https://www.xiaohongshu.com/user/profile/${userId}` : null
      };
    }
    function mapNoteCardItem(item) {
      const card = item?.noteCard || item?.note_card || item;
      if (!card || typeof card !== "object") return null;
      const noteId = item?.id ?? card.noteId ?? card.note_id ?? null;
      const xsecToken = item?.xsecToken ?? item?.xsec_token ?? card.xsecToken ?? card.xsec_token ?? null;
      const user = card.user || {};
      if (!noteId || !/^[a-f0-9]+$/i.test(String(noteId))) return null;
      return {
        id: noteId,
        note_id: noteId,
        xsec_token: xsecToken,
        title: card.displayTitle ?? card.display_title ?? card.title ?? null,
        type: card.type ?? null,
        url: xsecToken
          ? `https://www.xiaohongshu.com/explore/${noteId}?xsec_token=${encodeURIComponent(xsecToken)}&xsec_source=`
          : `https://www.xiaohongshu.com/explore/${noteId}`,
        author: user.nickname ?? user.nickName ?? null,
        author_id: user.userId ?? user.user_id ?? null,
        likes: card.interactInfo?.likedCount ?? card.interact_info?.liked_count ?? null,
        cover: card.cover?.urlDefault ?? card.cover?.urlPre ?? card.cover?.url ?? card.imageList?.[0]?.urlDefault ?? null,
        time: card.lastUpdateTime ?? card.last_update_time ?? card.time ?? null
      };
    }
    function flattenNoteGroups(groups) {
      const result = [];
      if (!Array.isArray(groups)) return result;
      for (const group of groups) {
        if (Array.isArray(group)) result.push(...group);
        else if (group) result.push(group);
      }
      return result;
    }
    function parseInitialState(html) {
      const match = html.match(/__INITIAL_STATE__=(\{[\s\S]*?\})<\/script>/);
      if (!match) throw new Error("SSR state not found");
      return (0, eval)("(" + match[1] + ")");
    }
    async function fetchHtml(url) {
      const response = await fetch(url, { credentials: "include" });
      if (!response.ok) throw new Error(`Request failed: ${response.status}`);
      return await response.text();
    }
    function parseNoteInput(input) {
      const raw = String(input ?? "").trim();
      let noteId = raw;
      let xsecToken = null;
      if (!raw) return { noteId: "", xsecToken: null };
      try {
        const url = new URL(raw, location.origin);
        const match = url.pathname.match(/\/(?:explore|search_result)\/([a-z0-9]+)/i);
        if (match) noteId = match[1];
        xsecToken = url.searchParams.get("xsec_token");
      } catch {}
      const idMatch = raw.match(/(?:explore|search_result)\/([a-z0-9]+)/i);
      if (idMatch) noteId = idMatch[1];
      const tokenMatch = raw.match(/[?&]xsec_token=([^&#]+)/i);
      if (!xsecToken && tokenMatch) {
        try { xsecToken = decodeURIComponent(tokenMatch[1]); } catch { xsecToken = tokenMatch[1]; }
      }
      return { noteId, xsecToken };
    }
    function buildNoteUrl(noteId, xsecToken) {
      return `https://www.xiaohongshu.com/explore/${noteId}?xsec_token=${encodeURIComponent(xsecToken)}&xsec_source=`;
    }
    function findTokenInCollection(items, noteId) {
      if (!Array.isArray(items)) return null;
      for (const item of items) {
        const mapped = mapNoteCardItem(item);
        if (mapped?.id === noteId && mapped.xsec_token) return mapped.xsec_token;
      }
      return null;
    }
    function resolveNoteToken(noteId) {
      if (!noteId) return null;
      const detail = getStore("note")?.noteDetailMap?.[noteId];
      const direct = detail?.note?.xsecToken ?? detail?.note?.xsec_token ?? null;
      if (direct) return direct;
      const searchToken = findTokenInCollection(getStore("search")?.feeds, noteId);
      if (searchToken) return searchToken;
      const feedToken = findTokenInCollection(getStore("feed")?.feeds, noteId);
      if (feedToken) return feedToken;
      const userToken = findTokenInCollection(flattenNoteGroups(getStore("user")?.notes), noteId);
      if (userToken) return userToken;
      const anchors = document.querySelectorAll(`a[href*="${noteId}"]`);
      for (const anchor of anchors) {
        const parsed = parseNoteInput(anchor.href || anchor.getAttribute("href") || "");
        if (parsed.noteId === noteId && parsed.xsecToken) return parsed.xsecToken;
      }
      return null;
    }
    function resolveNoteIdentity(input) {
      const parsed = parseNoteInput(input);
      const xsecToken = parsed.xsecToken || resolveNoteToken(parsed.noteId);
      return {
        noteId: parsed.noteId,
        xsecToken,
        url: parsed.noteId && xsecToken ? buildNoteUrl(parsed.noteId, xsecToken) : null
      };
    }
    async function navigate(path, query, waitMs = 1500) {
      const router = getRouter();
      if (!router) throw new Error("Router not found");
      router.push({ path, query }).catch(() => {});
      await sleep(waitMs);
      return router.currentRoute?.value || null;
    }
    async function openNoteAndWait(noteId, xsecToken, requireComments = false) {
      if (!noteId || !xsecToken) throw new Error("Missing note id or xsec token");
      const noteStore = getStore("note");
      if (!noteStore) throw new Error("Note store not found");
      await navigate(`/explore/${noteId}`, { xsec_token: xsecToken, xsec_source: "" }, 1800);
      if (noteStore.setCurrentNoteId) noteStore.setCurrentNoteId(noteId);
      if (noteStore.getNoteDetailByNoteId) {
        try {
          await withTimeout(noteStore.getNoteDetailByNoteId(noteId), 6000, "Note detail load timed out");
        } catch {}
      }
      const detail = await waitFor(() => {
        const current = noteStore.noteDetailMap?.[noteId];
        if (!current?.note || current.note.noteId !== noteId) return null;
        if (!requireComments) return toPlain(current);
        const list = current.comments?.list;
        if (Array.isArray(list) && (list.length > 0 || current.comments?.firstRequestFinish)) return toPlain(current);
        return null;
      }, requireComments ? 12000 : 8000, 250);
      if (!detail) throw new Error(requireComments ? "Note comments not loaded" : "Note detail not loaded");
      return detail;
    }
    return {
      sleep,
      getPinia,
      getRouter,
      getStore,
      toPlain,
      waitFor,
      withTimeout,
      normalizeUser,
      mapNoteCardItem,
      flattenNoteGroups,
      parseInitialState,
      fetchHtml,
      parseNoteInput,
      buildNoteUrl,
      resolveNoteIdentity,
      openNoteAndWait
    };
  })());

  const pinia = helper.getPinia();
  if (!pinia?._s) {
    return { error: "Page not ready", hint: "Ensure xiaohongshu.com is fully loaded" };
  }

  const userStore = helper.getStore("user");
  if (!userStore) {
    return { error: "User store not found", hint: "Ensure xiaohongshu.com is fully loaded" };
  }
  if (!userStore.loggedIn) return { error: "Not logged in", hint: "Run: bb-browser open https://www.xiaohongshu.com/explore — then log in manually" };

  const directUser = helper.normalizeUser(userStore.userInfo) || helper.normalizeUser(userStore.userPageData?.basicInfo);
  if (directUser) return directUser;

  let captured = null;
  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  const origFetch = globalThis.fetch;

  XMLHttpRequest.prototype.open = function(method, url) {
    this.__bbUrl = url;
    return origOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function(body) {
    if (String(this.__bbUrl || "").includes("/user/me")) {
      const request = this;
      const orig = request.onreadystatechange;
      request.onreadystatechange = function() {
        if (request.readyState === 4 && !captured) {
          try { captured = JSON.parse(request.responseText); } catch {}
        }
        if (orig) return orig.apply(this, arguments);
      };
    }
    return origSend.apply(this, arguments);
  };

  globalThis.fetch = async function(resource, init) {
    const response = await origFetch.apply(this, arguments);
    try {
      const url = typeof resource === "string" ? resource : resource?.url;
      if (!captured && url && String(url).includes("/user/me")) {
        captured = await response.clone().json();
      }
    } catch {}
    return response;
  };

  try {
    if (userStore.getUserInfo) {
      try { await helper.withTimeout(userStore.getUserInfo(), 6000, "User info load timed out"); } catch {}
    } else {
      const feedStore = helper.getStore("feed");
      if (feedStore?.fetchFeeds) {
        try { await helper.withTimeout(feedStore.fetchFeeds(), 6000, "Feed preload timed out"); } catch {}
      }
    }
    await helper.sleep(500);
  } finally {
    XMLHttpRequest.prototype.open = origOpen;
    XMLHttpRequest.prototype.send = origSend;
    globalThis.fetch = origFetch;
  }

  const refreshedUser = helper.normalizeUser(userStore.userInfo) || helper.normalizeUser(userStore.userPageData?.basicInfo);
  if (refreshedUser) return refreshedUser;

  const networkUser = helper.normalizeUser(captured?.data ?? captured);
  if (networkUser) return networkUser;

  return {
    error: captured?.msg || "Failed to get user info",
    hint: userStore.loggedIn
      ? "User store is logged in but profile data is not populated yet"
      : "Not logged in?"
  };
}
