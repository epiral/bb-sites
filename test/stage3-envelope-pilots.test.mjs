import test from "node:test";
import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import vm from "node:vm";

const edgeRepoEnv = process.env.PINIX_EDGE_REPO;
if (!edgeRepoEnv) {
  throw new Error("Test setup error: PINIX_EDGE_REPO is required and must point to a pinix-edge checkout/worktree.");
}

const EDGE_REPO = resolve(edgeRepoEnv);
const EDGE_SITE_ENVELOPE_PATH = join(EDGE_REPO, "main", "site-envelope.mjs");
const EDGE_SITE_HANDLER_PATH = join(EDGE_REPO, "main", "handlers", "site.mjs");

try {
  await access(EDGE_SITE_ENVELOPE_PATH);
  await access(EDGE_SITE_HANDLER_PATH);
} catch {
  throw new Error("Test setup error: PINIX_EDGE_REPO=" + EDGE_REPO + " is not a valid pinix-edge checkout; expected main/site-envelope.mjs and main/handlers/site.mjs.");
}

const {
  buildSiteResultEnvelope,
  unwrapSiteAdapterCarrier,
  SITE_RESULT_ENVELOPE_VERSION,
} = await import(pathToFileURL(EDGE_SITE_ENVELOPE_PATH).href);
const {
  buildEnabledSiteIndex,
} = await import(pathToFileURL(EDGE_SITE_HANDLER_PATH).href);

async function loadJSON(path) {
  return JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
}

async function loadAdapter(path, fetchImpl) {
  const source = await readFile(new URL("../" + path, import.meta.url), "utf8");
  const patched = source.replace(/async function\s*\(\s*args\s*\)\s*\{/, "globalThis.__adapter = async function(args) {");
  const context = vm.createContext({ fetch: fetchImpl, console, URL, globalThis: {} });
  vm.runInContext(patched, context, { filename: path });
  assert.equal(typeof context.globalThis.__adapter, "function");
  return context.globalThis.__adapter;
}

function response(body, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body
  };
}

function envelopeFor(siteName, commandName, manifest, result, args = {}) {
  const cmdMeta = manifest.commands[commandName];
  return buildSiteResultEnvelope({
    siteName,
    commandName,
    manifest,
    cmdMeta,
    args,
    profile: siteName === "reddit" ? "default" : undefined,
    result,
    retrievedAt: "2026-08-05T00:00:00.000Z"
  });
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(TEST_DIR, "..");

function createFakeDebugger(fetchImpl) {
  let attached = false;
  const context = vm.createContext({ fetch: fetchImpl, console, URL, globalThis: {} });
  return {
    isAttached: () => attached,
    attach: () => { attached = true; },
    detach: () => { attached = false; },
    async sendCommand(method, params) {
      if (method !== "Runtime.evaluate") throw new Error("Unexpected CDP method: " + method);
      try {
        const value = await vm.runInContext(params.expression, context, { timeout: 60000 });
        return { result: { value } };
      } catch (error) {
        return {
          exceptionDetails: {
            text: error.message,
            exception: { description: error.stack || error.message }
          }
        };
      }
    }
  };
}

async function createActualHandler(fetchImpl) {
  const home = await mkdtemp(join(tmpdir(), "bb-sites-stage3-actual-"));
  await mkdir(join(home, ".pinix", "sites", "pinix"), { recursive: true });
  await symlink(join(REPO_ROOT, "hackernews"), join(home, ".pinix", "sites", "pinix", "hackernews"), "dir");

  const previousHome = process.env.HOME;
  process.env.HOME = home;
  let createSiteHandler;
  try {
    const handlerModuleURL = pathToFileURL(EDGE_SITE_HANDLER_PATH);
    handlerModuleURL.search = "actual=" + Date.now() + "-" + Math.random();
    ({ createSiteHandler } = await import(handlerModuleURL.href));
  } finally {
    process.env.HOME = previousHome;
  }

  const fakeDebugger = createFakeDebugger(fetchImpl);
  const tab = {
    id: "tab-actual-hn",
    profile: "default",
    view: { webContents: { debugger: fakeDebugger } }
  };
  return createSiteHandler({
    syncOnExec: false,
    tabManager: {
      requireProfile(profile) {
        if (!profile) throw new Error("actual handler test expected explicit profile");
        return profile;
      },
      resolveTarget() {
        return { tab };
      },
      async withCommandAttach(_tabId, _opts, fn) {
        return await fn();
      }
    }
  });
}

function hnThreadFetch(fixture) {
  return async (url) => {
    const id = url.match(/item\/(.+?)\.json/)?.[1];
    return response(fixture.items[id] || null);
  };
}

test("manifests expose Stage3 metadata for only the selected pilot commands", async () => {
  assert.equal(EDGE_SITE_ENVELOPE_PATH.startsWith(EDGE_REPO + "/"), true);
  assert.equal(EDGE_SITE_HANDLER_PATH.startsWith(EDGE_REPO + "/"), true);

  const hn = await loadJSON("../hackernews/site.json");
  const reddit = await loadJSON("../reddit/site.json");

  assert.deepEqual(Object.keys(hn.commands).sort(), ["thread", "top"]);
  assert.equal(hn.commands.top.envelope_versions[0], SITE_RESULT_ENVELOPE_VERSION);
  assert.equal(hn.commands.thread.auth, "none");
  assert.equal(hn.commands.thread.side_effect, "read_only");
  assert.equal(hn.commands.search, undefined);
  assert.equal(hn.commands.user, undefined);

  assert.equal(reddit.commands.search.envelope_versions[0], SITE_RESULT_ENVELOPE_VERSION);
  assert.equal(reddit.commands.thread.auth, "optional");
  assert.equal(reddit.commands.thread.profile, "required");
  assert.equal(reddit.commands["user-comments"], undefined);
  assert.equal(reddit.commands.context.output_modes[0], "legacy");

  const catalog = buildEnabledSiteIndex({
    data: [
      { alias: "hackernews", scope: "pinix", name: "hackernews", active_version: hn.version, active_hash: "sha256:hn", download_url: "/hn.tgz", commands: Object.entries(hn.commands).map(([name, meta]) => ({ name, ...meta })) },
      { alias: "reddit", scope: "pinix", name: "reddit", active_version: reddit.version, active_hash: "sha256:reddit", download_url: "/reddit.tgz", commands: Object.entries(reddit.commands).map(([name, meta]) => ({ name, ...meta })) }
    ]
  });
  assert.equal(catalog.get("hackernews").commands.find((cmd) => cmd.name === "top").envelope_versions[0], SITE_RESULT_ENVELOPE_VERSION);
  assert.equal(catalog.get("reddit").commands.find((cmd) => cmd.name === "thread").serialization_key, "site:reddit:{profile}");
});

test("hackernews top returns legacy-shaped data plus carrier metadata", async () => {
  const fixture = await loadJSON("../fixtures/hackernews/top.json");
  const manifest = await loadJSON("../hackernews/site.json");
  const adapter = await loadAdapter("hackernews/top.js", async (url) => {
    if (url.endsWith("/topstories.json")) return response(fixture.normal.ids);
    const id = url.match(/item\/(\d+)\.json/)?.[1];
    return response(fixture.normal.items[id] || null);
  });

  const result = await adapter({ count: "2" });
  const legacy = unwrapSiteAdapterCarrier(result, manifest.commands.top);
  assert.deepEqual(plain(legacy), {
    count: 2,
    posts: [
      { rank: 1, id: 101, title: "First HN story", url: "https://example.com/first", hn_url: "https://news.ycombinator.com/item?id=101", author: "alice", score: 42, comments: 7 },
      { rank: 2, id: 102, title: "Second HN story", url: null, hn_url: "https://news.ycombinator.com/item?id=102", author: "bob", score: 11, comments: 0 }
    ]
  });

  const env = envelopeFor("hackernews", "top", manifest, result, { count: "2" });
  assert.equal(env.status, "ok");
  assert.equal(env.completeness, "partial");
  assert.equal(env.reason, "limit_truncated");
  assert.deepEqual(env.command.effective_args, { count: 2 });
  assert.equal(env.source.url, "https://hacker-news.firebaseio.com/v0/topstories.json");
  assert.deepEqual(env.pagination, {
    limit: 2,
    selected: 2,
    returned: 2,
    total_available: 3,
    truncated: true,
    selected_omitted: 0,
    fetch_missing_omitted: 0,
    deleted_dead_omitted: 0,
    non_story_omitted: 0,
    missing_title_omitted: 0
  });
  assert.deepEqual(env.auth, { requirement: "none", authenticated_as: "not_applicable" });
});

test("hackernews top covers complete, empty and limit clamp without live fetch", async () => {
  const fixture = await loadJSON("../fixtures/hackernews/top.json");
  const manifest = await loadJSON("../hackernews/site.json");
  const completeAdapter = await loadAdapter("hackernews/top.js", async (url) => {
    if (url.endsWith("/topstories.json")) return response(fixture.normal.ids);
    const id = url.match(/item\/(\d+)\.json/)?.[1];
    return response(fixture.normal.items[id] || null);
  });
  const complete = envelopeFor("hackernews", "top", manifest, await completeAdapter({ count: "3" }), { count: "3" });
  assert.equal(complete.completeness, "complete");
  assert.equal(complete.reason, "complete");
  assert.equal(complete.pagination.returned, 3);
  assert.equal(complete.pagination.selected_omitted, 0);

  const emptyAdapter = await loadAdapter("hackernews/top.js", async () => response(fixture.empty.ids));
  const empty = envelopeFor("hackernews", "top", manifest, await emptyAdapter({ count: "5" }), { count: "5" });
  assert.equal(empty.completeness, "empty");
  assert.deepEqual(plain(empty.data), { count: 0, posts: [] });

  const ids = Array.from({ length: 51 }, (_, i) => i + 1);
  const adapter = await loadAdapter("hackernews/top.js", async (url) => {
    if (url.endsWith("/topstories.json")) return response(ids);
    const id = Number(url.match(/item\/(\d+)\.json/)?.[1]);
    return response({ id, type: "story", title: "Story " + id, by: "u", score: id, descendants: 0 });
  });
  const env = envelopeFor("hackernews", "top", manifest, await adapter({ count: "500" }), { count: "500" });
  assert.equal(env.command.effective_args.count, 50);
  assert.equal(env.pagination.returned, 50);
  assert.equal(env.pagination.truncated, true);
});

test("hackernews top reports selected fetch/filter omissions as partial", async () => {
  const fixture = await loadJSON("../fixtures/hackernews/top.json");
  const manifest = await loadJSON("../hackernews/site.json");
  const adapter = await loadAdapter("hackernews/top.js", async (url) => {
    if (url.endsWith("/topstories.json")) return response(fixture.selected_omissions.ids);
    const id = url.match(/item\/(\d+)\.json/)?.[1];
    return response(fixture.selected_omissions.items[id] || null);
  });
  const env = envelopeFor("hackernews", "top", manifest, await adapter({ count: "5" }), { count: "5" });
  assert.equal(env.completeness, "partial");
  assert.equal(env.reason, "selected_items_omitted");
  assert.equal(env.data.count, 1);
  assert.equal(env.pagination.returned, 1);
  assert.equal(env.pagination.selected, 5);
  assert.equal(env.pagination.selected_omitted, 4);
  assert.equal(env.pagination.fetch_missing_omitted, 1);
  assert.equal(env.pagination.deleted_dead_omitted, 2);
  assert.equal(env.pagination.non_story_omitted, 1);
  assert.equal(env.pagination.missing_title_omitted, 0);
  assert.equal(env.warnings.some((warning) => warning.code === "SELECTED_ITEMS_OMITTED"), true);
});

test("hackernews top covers invalid and network paths without live fetch", async () => {
  const adapter = await loadAdapter("hackernews/top.js", async () => response({unexpected: true}));
  assert.deepEqual(plain(await adapter({ count: "1" })), {
    error: "Unexpected response",
    hint: "HN Firebase topstories response was not a list"
  });

  const networkAdapter = await loadAdapter("hackernews/top.js", async () => { throw new Error("network down"); });
  await assert.rejects(() => networkAdapter({ count: "1" }), /network down/);
});

test("hackernews thread omits deleted/dead and reports proven partial depth truncation", async () => {
  const fixture = await loadJSON("../fixtures/hackernews/thread.json");
  const manifest = await loadJSON("../hackernews/site.json");
  const adapter = await loadAdapter("hackernews/thread.js", hnThreadFetch(fixture));
  const threadArgs = { id: "https://news.ycombinator.com/item?id=200&token=fake#frag", depth: "0" };
  const result = await adapter(threadArgs);
  const legacy = unwrapSiteAdapterCarrier(result, manifest.commands.thread);
  assert.equal(legacy.post.id, 200);
  assert.equal(legacy.comments.length, 1);
  assert.equal(legacy.comments[0].id, 201);
  assert.deepEqual(plain(legacy.comments[0].replies), []);

  const env = envelopeFor("hackernews", "thread", manifest, result, threadArgs);
  assert.equal(env.completeness, "partial");
  assert.equal(env.reason, "comments_omitted");
  assert.deepEqual(plain(env.command.requested_args), { id: "https://news.ycombinator.com/item?id=200", depth: "0" });
  assert.deepEqual(env.command.effective_args, { id: "200", depth: 0 });
  assert.equal(env.pagination.deleted_dead_omitted, 2);
  assert.equal(env.pagination.depth_truncated, 1);
  assert.equal(env.pagination.comments_returned, 1);
  assert.equal(env.pagination.top_level_comments_returned, 1);
});

test("hackernews thread actual Edge handler accepts numeric token ids", async () => {
  const fixture = await loadJSON("../fixtures/hackernews/thread.json");
  const handler = await createActualHandler(hnThreadFetch(fixture));

  const defaultResult = await handler.exec({ command: "hackernews thread --id 200 --depth 0", profile: "default" }, {});
  assert.equal(defaultResult.__pinix_site_result, undefined);
  assert.equal(defaultResult.post.id, 200);
  assert.equal(defaultResult.comments.length, 1);

  const env = await handler.exec({ command: "hackernews thread --id 200 --depth 0 --envelope v1", profile: "default" }, {});
  assert.equal(env.status, "ok");
  assert.equal(env.data.post.id, 200);
  assert.deepEqual(plain(env.command.requested_args), { id: 200, depth: 0 });
  assert.deepEqual(plain(env.command.effective_args), { id: "200", depth: 0 });
});

test("hackernews thread actual Edge handler accepts string numeric and URL ids", async () => {
  const fixture = await loadJSON("../fixtures/hackernews/thread.json");
  const handler = await createActualHandler(hnThreadFetch(fixture));

  const stringNumeric = await handler.exec({ command: "hackernews thread --id 1234567890123456 --depth 1 --envelope v1", profile: "default" }, {});
  assert.equal(stringNumeric.status, "ok");
  assert.deepEqual(plain(stringNumeric.command.requested_args), { id: "1234567890123456", depth: 1 });
  assert.deepEqual(plain(stringNumeric.command.effective_args), { id: "1234567890123456", depth: 1 });

  const urlId = await handler.exec({ command: "hackernews thread --id \"https://news.ycombinator.com/item?id=200&token=fake#frag\" --depth 0 --envelope v1", profile: "default" }, {});
  assert.equal(urlId.status, "ok");
  assert.deepEqual(plain(urlId.command.requested_args), { id: "https://news.ycombinator.com/item?id=200", depth: 0 });
  assert.deepEqual(plain(urlId.command.effective_args), { id: "200", depth: 0 });
});

test("hackernews thread actual Edge handler preserves missing null and invalid semantics", async () => {
  const fixture = await loadJSON("../fixtures/hackernews/thread.json");
  const handler = await createActualHandler(hnThreadFetch(fixture));

  assert.deepEqual(plain(await handler.exec({ command: "hackernews thread --depth 1", profile: "default" }, {})), {
    error: "Missing argument: id",
    hint: "Provide an HN item ID or item URL"
  });
  assert.deepEqual(plain(await handler.exec({ command: "hackernews thread --id null --depth 1", profile: "default" }, {})), {
    error: "Missing argument: id",
    hint: "Provide an HN item ID or item URL"
  });
  assert.deepEqual(plain(await handler.exec({ command: "hackernews thread --id 999 --depth 1", profile: "default" }, {})), {
    error: "Item not found",
    hint: "Check the ID: 999"
  });
});

test("hackernews thread counts nested comments recursively", async () => {
  const fixture = await loadJSON("../fixtures/hackernews/thread.json");
  const manifest = await loadJSON("../hackernews/site.json");
  const adapter = await loadAdapter("hackernews/thread.js", hnThreadFetch(fixture));
  const env = envelopeFor("hackernews", "thread", manifest, await adapter({ id: "210", depth: "2" }), { id: "210", depth: "2" });
  assert.equal(env.completeness, "complete");
  assert.equal(env.pagination.comments_returned, 2);
  assert.equal(env.pagination.top_level_comments_returned, 1);
});

test("hackernews thread reports deleted/dead root as non-complete metadata without changing legacy data", async () => {
  const fixture = await loadJSON("../fixtures/hackernews/thread.json");
  const manifest = await loadJSON("../hackernews/site.json");
  const adapter = await loadAdapter("hackernews/thread.js", hnThreadFetch(fixture));

  const deletedResult = await adapter({ id: "220" });
  const deletedLegacy = unwrapSiteAdapterCarrier(deletedResult, manifest.commands.thread);
  const deletedEnv = envelopeFor("hackernews", "thread", manifest, deletedResult, { id: "220" });
  assert.deepEqual(plain(deletedLegacy), plain(deletedResult.data));
  assert.equal(deletedEnv.completeness, "partial");
  assert.equal(deletedEnv.reason, "root_unavailable");
  assert.equal(deletedEnv.pagination.root_deleted, 1);
  assert.equal(deletedEnv.pagination.root_dead, 0);
  assert.equal(deletedEnv.pagination.comments_returned, 0);
  assert.equal(deletedEnv.warnings.some((warning) => warning.code === "ROOT_UNAVAILABLE"), true);

  const deadResult = await adapter({ id: "221" });
  const deadEnv = envelopeFor("hackernews", "thread", manifest, deadResult, { id: "221" });
  assert.equal(deadEnv.completeness, "partial");
  assert.equal(deadEnv.reason, "root_unavailable");
  assert.equal(deadEnv.pagination.root_deleted, 0);
  assert.equal(deadEnv.pagination.root_dead, 1);
  assert.equal(deadEnv.pagination.comments_returned, 0);
  assert.equal(deadEnv.warnings.some((warning) => warning.code === "ROOT_UNAVAILABLE"), true);
});

test("hackernews thread covers invalid and network paths", async () => {
  const adapter = await loadAdapter("hackernews/thread.js", async () => response(null));
  assert.deepEqual(plain(await adapter({})), {
    error: "Missing argument: id",
    hint: "Provide an HN item ID or item URL"
  });
  assert.deepEqual(plain(await adapter({ id: "999" })), {
    error: "Item not found",
    hint: "Check the ID: 999"
  });

  const networkAdapter = await loadAdapter("hackernews/thread.js", async () => { throw new Error("network down"); });
  await assert.rejects(() => networkAdapter({ id: "999" }), /network down/);
});

test("reddit search returns listing data, after cursor, optional auth and redacted envelope", async () => {
  const fixture = await loadJSON("../fixtures/reddit/search.json");
  const manifest = await loadJSON("../reddit/site.json");
  const adapter = await loadAdapter("reddit/search.js", async (url, options) => {
    assert.equal(options.credentials, "include");
    assert.match(url, /^\/search\.json\?/);
    return response(fixture.normal);
  });
  const args = { query: "coding agents", sort: "top", time: "week", count: "2" };
  const result = await adapter(args);
  const legacy = unwrapSiteAdapterCarrier(result, manifest.commands.search);
  assert.equal(legacy.query, "coding agents");
  assert.equal(legacy.count, 1);
  assert.equal(legacy.after, "t3_after");

  const env = envelopeFor("reddit", "search", manifest, result, args);
  assert.equal(env.completeness, "partial");
  assert.deepEqual(plain(env.command.effective_args), { query: "coding agents", sort: "top", time: "week", count: 2 });
  assert.equal(env.source.url, "https://www.reddit.com/search.json?q=coding%20agents&sort=top&t=week&limit=2&raw_json=1");
  assert.deepEqual(plain(env.pagination), { limit: 2, returned: 1, after: "t3_after" });
  assert.deepEqual(plain(env.auth), { requirement: "optional", authenticated_as: "unknown" });
});

test("reddit search covers empty, invalid and network paths", async () => {
  const fixture = await loadJSON("../fixtures/reddit/search.json");
  const manifest = await loadJSON("../reddit/site.json");
  const adapter = await loadAdapter("reddit/search.js", async () => response(fixture.empty));
  const empty = envelopeFor("reddit", "search", manifest, await adapter({ query: "none" }), { query: "none" });
  assert.equal(empty.completeness, "empty");
  assert.equal(empty.data.count, 0);

  const invalid = await adapter({});
  assert.deepEqual(plain(invalid), { error: "Missing argument: query", hint: "Provide a search query" });

  const networkAdapter = await loadAdapter("reddit/search.js", async () => { throw Object.assign(new Error("network down"), { code: "NETWORK_DOWN" }); });
  await assert.rejects(() => networkAdapter({ query: "x" }), /network down/);
});

test("reddit thread reports two-array comments, more placeholder and depth-limit partial", async () => {
  const fixture = await loadJSON("../fixtures/reddit/thread.json");
  const manifest = await loadJSON("../reddit/site.json");
  const adapter = await loadAdapter("reddit/thread.js", async (url, options) => {
    assert.equal(options.credentials, "include");
    assert.equal(url, "/r/AI_Agents/comments/post/.json?limit=2&depth=0&raw_json=1");
    return response(fixture.normal);
  });

  const args = { url: "https://www.reddit.com/r/AI_Agents/comments/post/thread-slug/?utm_source=secret#frag", depth: "0", count: "2" };
  const result = await adapter(args);
  const legacy = unwrapSiteAdapterCarrier(result, manifest.commands.thread);
  assert.equal(legacy.post.id, "t3_post");
  assert.equal(legacy.comments_total, 1);
  assert.equal(legacy.comments[0].id, "t1_a");

  const env = envelopeFor("reddit", "thread", manifest, result, args);
  assert.equal(env.completeness, "partial");
  assert.equal(env.reason, "comments_omitted");
  assert.deepEqual(plain(env.command.effective_args), { url: "https://www.reddit.com/r/AI_Agents/comments/post/", depth: 0, count: 2 });
  assert.equal(env.source.url, "https://www.reddit.com/r/AI_Agents/comments/post/.json?limit=2&depth=0&raw_json=1");
  assert.equal(env.pagination.more_children_omitted, 2);
  assert.equal(env.pagination.depth_truncated, 1);
});

test("reddit thread invalid and network paths remain legacy-compatible", async () => {
  const adapter = await loadAdapter("reddit/thread.js", async () => response({}));
  assert.deepEqual(plain(await adapter({})), { error: "Missing argument: url", hint: "Provide a Reddit post URL" });
  assert.deepEqual(plain(await adapter({ url: "https://www.reddit.com/r/x/comments/y/z/" })), { error: "Unexpected response", hint: "Post may be deleted or URL is incorrect" });

  const networkAdapter = await loadAdapter("reddit/thread.js", async () => { throw new Error("network down"); });
  await assert.rejects(() => networkAdapter({ url: "https://www.reddit.com/r/x/comments/y/z/" }), /network down/);
});
