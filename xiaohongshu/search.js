/* @meta
{
  "name": "xiaohongshu/search",
  "description": "Search Xiaohongshu notes",
  "domain": "www.xiaohongshu.com",
  "args": {
    "keyword": {"required": true, "description": "Search keyword"},
    "sort": {"required": false, "description": "Sort: general (default), latest, likes, comments, collects"}
  },
  "capabilities": ["network"],
  "readOnly": true,
  "example": "bb-browser site xiaohongshu/search fashion --sort likes"
}
*/

async function(args) {
  if (!args.keyword) return { error: "Missing argument: keyword" };

  const sortAliases = {
    general: "general",
    default: "general",
    comprehensive: "general",
    "\u7efc\u5408": "general",
    latest: "time_descending",
    newest: "time_descending",
    time: "time_descending",
    time_descending: "time_descending",
    "\u6700\u65b0": "time_descending",
    likes: "popularity_descending",
    popular: "popularity_descending",
    popularity: "popularity_descending",
    popularity_descending: "popularity_descending",
    most_likes: "popularity_descending",
    "\u6700\u591a\u70b9\u8d5e": "popularity_descending",
    comments: "comment_descending",
    comment_descending: "comment_descending",
    most_comments: "comment_descending",
    "\u6700\u591a\u8bc4\u8bba": "comment_descending",
    collects: "collect_descending",
    favorites: "collect_descending",
    favourite: "collect_descending",
    collect_descending: "collect_descending",
    most_collects: "collect_descending",
    "\u6700\u591a\u6536\u85cf": "collect_descending"
  };
  const sortLabelFallbacks = {
    general: "Comprehensive",
    time_descending: "Newest",
    popularity_descending: "Most Likes",
    comment_descending: "Most Comments",
    collect_descending: "Most Collects"
  };
  const filterOrder = [
    "sort_type",
    "filter_note_type",
    "filter_note_time",
    "filter_note_range",
    "filter_pos_distance"
  ];
  const requestedSortInput = String(args.sort ?? "general").trim();
  const requestedSortKey = requestedSortInput.toLowerCase();
  const requestedSort = sortAliases[requestedSortKey] || sortAliases[requestedSortInput] || null;
  if (!requestedSort) {
    return {
      error: `Invalid sort: ${requestedSortInput}`,
      hint: "Supported sort: general, latest, likes, comments, collects"
    };
  }

  function buildSearchFilters(filterGroups, sortId) {
    const groups = Array.isArray(filterGroups) ? filterGroups : [];
    return filterOrder.map((groupId) => {
      const group = groups.find((item) => item?.id === groupId);
      const tags = Array.isArray(group?.filterTags) ? group.filterTags : [];
      let tagId = groupId === "sort_type" ? sortId : "\u4e0d\u9650";
      if (groupId === "sort_type") {
        const matched = tags.find((tag) => tag?.id === sortId);
        if (matched?.id) tagId = matched.id;
      } else if (tags[0]?.id) {
        tagId = tags[0].id;
      }
      return { tags: [tagId], type: groupId };
    });
  }

  function buildActiveFilters(filterGroups, filterParams) {
    const groups = Array.isArray(filterGroups) ? filterGroups : [];
    return filterOrder.map((groupId) => {
      const group = groups.find((item) => item?.id === groupId);
      const tags = Array.isArray(group?.filterTags) ? group.filterTags : [];
      const selected = filterParams.find((item) => item?.type === groupId)?.tags?.[0];
      const index = tags.findIndex((tag) => tag?.id === selected);
      return index >= 0 ? index : 0;
    });
  }

  function resolveSortLabel(filterGroups, sortId) {
    const groups = Array.isArray(filterGroups) ? filterGroups : [];
    const sortGroup = groups.find((item) => item?.id === "sort_type");
    const matched = Array.isArray(sortGroup?.filterTags)
      ? sortGroup.filterTags.find((tag) => tag?.id === sortId)
      : null;
    return matched?.name || sortLabelFallbacks[sortId] || sortId;
  }

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
      openNoteAndWait,
      navigate
    };
  })());

  const pinia = helper.getPinia();
  if (!pinia?._s) {
    return { error: "Page not ready", hint: "Ensure xiaohongshu.com is fully loaded" };
  }

  const searchStore = helper.getStore("search");
  if (!searchStore) {
    return { error: "Search store not found", hint: "Ensure xiaohongshu.com is fully loaded" };
  }

  let availableFilters = [];
  let appliedFilterParams = buildSearchFilters([], requestedSort);

  let captured = null;
  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  const origFetch = globalThis.fetch;

  XMLHttpRequest.prototype.open = function(method, url) {
    this.__bbUrl = url;
    return origOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function(body) {
    if (String(this.__bbUrl || "").includes("search/notes")) {
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
      if (!captured && url && String(url).includes("search/notes")) {
        captured = await response.clone().json();
      }
    } catch {}
    return response;
  };

  try {
    const router = helper.getRouter();
    if (!router) {
      return { error: "Router not found", hint: "Refresh the page and retry" };
    }

    router.push({
      path: "/search_result",
      query: { keyword: args.keyword, source: "web_search_result_notes" }
    }).catch(() => {});

    const routeReady = await helper.waitFor(() => {
      const route = router.currentRoute?.value;
      if (!route) return null;
      return route.path === "/search_result" ? route : null;
    }, 10000, 250);

    if (!routeReady) {
      return { error: "Search page did not load", hint: "Retry from an open Xiaohongshu tab" };
    }

    await helper.sleep(1200);

    availableFilters = await helper.waitFor(() => {
      const filters = helper.toPlain(searchStore.filters || []);
      return Array.isArray(filters) && filters.length > 0 ? filters : null;
    }, 5000, 200) || helper.toPlain(searchStore.filters || []);

    appliedFilterParams = buildSearchFilters(availableFilters, requestedSort);
    const activeFilters = buildActiveFilters(availableFilters, appliedFilterParams);

    searchStore.mutateSearchValue?.(args.keyword);
    if (searchStore.searchContext) {
      searchStore.searchContext.keyword = args.keyword;
      searchStore.searchContext.page = 1;
      searchStore.searchContext.pageSize = searchStore.searchContext.pageSize || 20;
      searchStore.searchContext.searchId = searchStore.searchContext.searchId || searchStore.rootSearchId || `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
      searchStore.searchContext.sort = requestedSort;
      searchStore.searchContext.noteType = searchStore.searchContext.noteType ?? 0;
      searchStore.searchContext.extFlags = Array.isArray(searchStore.searchContext.extFlags) ? searchStore.searchContext.extFlags : [];
      searchStore.searchContext.filters = appliedFilterParams;
      searchStore.searchContext.geo = searchStore.searchContext.geo || "";
      searchStore.searchContext.imageFormats = Array.isArray(searchStore.searchContext.imageFormats) && searchStore.searchContext.imageFormats.length
        ? searchStore.searchContext.imageFormats
        : ["jpg", "webp", "avif"];
    }
    searchStore.filterParams = appliedFilterParams;
    searchStore.activeFilters = activeFilters;

    searchStore.resetSearchNoteStore?.();
    try {
      if (searchStore.searchNotes) {
        searchStore.searchNotes();
      } else if (searchStore.loadMore) {
        searchStore.loadMore();
      }
    } catch {}

    await helper.waitFor(() => captured, 12000, 200);
    await helper.sleep(300);
  } finally {
    XMLHttpRequest.prototype.open = origOpen;
    XMLHttpRequest.prototype.send = origSend;
    globalThis.fetch = origFetch;
  }

  const rawItems = Array.isArray(captured?.data?.items)
    ? captured.data.items
    : helper.toPlain(searchStore.feeds || []);

  helper.rememberNoteTokens(rawItems);

  const notes = (Array.isArray(rawItems) ? rawItems : [])
    .map(helper.mapNoteCardItem)
    .filter((note) => note && /^[a-f0-9]+$/i.test(String(note.id)));

  if (captured && captured.success === false) {
    return {
      error: captured.msg || "Search failed",
      hint: "Search request reached Xiaohongshu but did not return usable results"
    };
  }

  return {
    keyword: args.keyword,
    sort: requestedSort,
    sort_label: resolveSortLabel(availableFilters, requestedSort),
    count: notes.length,
    has_more: captured?.data?.has_more ?? searchStore?.hasMore ?? false,
    notes
  };
}
