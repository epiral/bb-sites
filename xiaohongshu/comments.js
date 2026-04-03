/* @meta
{
  "name": "xiaohongshu/comments",
  "description": "Get Xiaohongshu note comments",
  "domain": "www.xiaohongshu.com",
  "args": {
    "note_id": {"required": true, "description": "Note ID or full note URL"}
  },
  "capabilities": ["network"],
  "readOnly": true,
  "example": "bb-browser site xiaohongshu/comments 69aa7160000000001b01634d"
}
*/

async function(args) {
  if (!args.note_id) return { error: "Missing argument: note_id" };

  const helper = globalThis.__bbBrowserXhsHelper?.rememberNoteTokens
    ? globalThis.__bbBrowserXhsHelper
    : (globalThis.__bbBrowserXhsHelper = (() => {
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
    function getTokenCache() {
      if (!globalThis.__bbBrowserXhsTokenCache) globalThis.__bbBrowserXhsTokenCache = {};
      return globalThis.__bbBrowserXhsTokenCache;
    }
    function rememberNoteTokens(items) {
      const cache = getTokenCache();
      if (!Array.isArray(items)) return cache;
      for (const item of items) {
        const mapped = mapNoteCardItem(item);
        if (mapped?.id && mapped.xsec_token) cache[mapped.id] = mapped.xsec_token;
      }
      return cache;
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
      const cached = getTokenCache()[noteId];
      if (cached) return cached;
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
      rememberNoteTokens,
      resolveNoteIdentity,
      openNoteAndWait
    };
  })());

  const pinia = helper.getPinia();
  if (!pinia?._s) {
    return { error: "Page not ready", hint: "Ensure xiaohongshu.com is fully loaded" };
  }

  const resolved = helper.resolveNoteIdentity(args.note_id);
  if (!resolved.noteId) {
    return { error: "Invalid note_id", hint: "Pass a note ID or a full note URL" };
  }
  if (!resolved.xsecToken) {
    return {
      error: "Missing xsec token for note",
      hint: "Pass a full note URL, or search/feed that note first so its token is available in the current page data"
    };
  }

  let detail;
  try {
    detail = await helper.openNoteAndWait(resolved.noteId, resolved.xsecToken, true);
  } catch (error) {
    return {
      error: error?.message || "Comments fetch failed",
      hint: "The note may be unavailable, deleted, or restricted"
    };
  }

  const commentsState = detail?.comments || {};
  helper.rememberNoteTokens([{ id: resolved.noteId, xsecToken: resolved.xsecToken, noteCard: { noteId: resolved.noteId } }]);
  const comments = Array.isArray(commentsState.list)
    ? commentsState.list.map((comment) => ({
        id: comment?.id ?? null,
        author: comment?.userInfo?.nickname ?? comment?.user_info?.nickname ?? null,
        author_id: comment?.userInfo?.userId ?? comment?.userInfo?.user_id ?? comment?.user_info?.user_id ?? null,
        content: comment?.content ?? null,
        likes: comment?.likeCount ?? comment?.like_count ?? null,
        sub_comment_count: comment?.subCommentCount ?? comment?.sub_comment_count ?? null,
        created_time: comment?.createTime ?? comment?.create_time ?? null
      }))
      : [];

  return {
    note_id: resolved.noteId,
    count: comments.length,
    has_more: commentsState.hasMore ?? commentsState.has_more ?? false,
    cursor: commentsState.cursor ?? null,
    comments
  };
}
