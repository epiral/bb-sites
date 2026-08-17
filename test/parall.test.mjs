import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import vm from "node:vm";

const edgeRepoEnv = process.env.PINIX_EDGE_REPO;
if (!edgeRepoEnv) throw new Error("Test setup error: PINIX_EDGE_REPO is required and must point to a pinix-edge checkout/worktree.");
const edgeRepo = resolve(edgeRepoEnv);
const envelopePath = join(edgeRepo, "main", "site-envelope.mjs");
try {
  await access(envelopePath);
} catch {
  throw new Error("Test setup error: PINIX_EDGE_REPO=" + edgeRepo + " is not a valid Edge checkout; expected main/site-envelope.mjs.");
}
const {buildSiteResultEnvelope, unwrapSiteAdapterCarrier, SITE_RESULT_ENVELOPE_VERSION} = await import(pathToFileURL(envelopePath).href);

const TEST_DIR = resolve(fileURLToPath(new URL(".", import.meta.url)));
const REPO_ROOT = resolve(TEST_DIR, "..");
const manifest = JSON.parse(await readFile(join(REPO_ROOT, "parall", "site.json"), "utf8"));
const fixtures = JSON.parse(await readFile(join(REPO_ROOT, "fixtures", "parall", "api.json"), "utf8"));

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

const capturedRequests = [];
const capturedPageExpressions = [];

function pageResponse(body, ok = true, status = 200, retryAfter = null) {
  return {ok, status, retry_after: retryAfter, body: clone(body)};
}

function fakePageFetch(url) {
  const parsed = new URL(url);
  capturedRequests.push(String(url));
  const path = parsed.pathname;
  if (path === "/api/v1/users/me") return pageResponse(fixtures.me);
  if (path === "/api/v1/orgs") return pageResponse(fixtures.orgs);
  if (path.endsWith("/projects/task-summary")) return pageResponse(fixtures.project_summary);
  if (path.endsWith("/projects")) return pageResponse(fixtures.projects);
  if (path.endsWith("/tasks/subtask-summary")) return pageResponse({data: [{task_id: "tsk_one", done: 1, total: 3}]});
  if (path.endsWith("/tasks")) return pageResponse(fixtures.tasks);
  if (path.endsWith("/inbox")) return pageResponse(fixtures.inbox);
  if (path.endsWith("/chats")) return pageResponse(fixtures.chats);
  if (path.endsWith("/messages")) return pageResponse(fixtures.messages);
  if (path.endsWith("/members")) return pageResponse(fixtures.members);
  if (path.endsWith("/agents")) return pageResponse(fixtures.agents);
  if (path.endsWith("/sessions")) return pageResponse(fixtures.sessions);
  return pageResponse({error: "not found"}, false, 404);
}

function fakeBrowser(pageFetchImpl) {
  return {
    open: async () => ({
      waitForSelector: async () => true,
      eval: async (expression) => {
        capturedPageExpressions.push(expression);
        const match = expression.match(/fetch\(("(?:\\.|[^"])*"),\s*\{/s);
        assert.ok(match, "page request expression must call fetch with an explicit URL");
        const url = JSON.parse(match[1]);
        try {
          return await pageFetchImpl(url);
        } catch (error) {
          return {ok: false, status: 0, network_error: String(error?.message || error)};
        }
      }
    })
  };
}

async function loadAdapter(name, {pageFetchImpl = fakePageFetch, browserEnabled = true} = {}) {
  const helper = await readFile(join(REPO_ROOT, "parall", "_helper.js"), "utf8");
  const source = await readFile(join(REPO_ROOT, "parall", name + ".js"), "utf8");
  const context = vm.createContext({
    browser: browserEnabled ? fakeBrowser(pageFetchImpl) : undefined,
    console,
    URL,
    URLSearchParams,
    globalThis: {}
  });
  vm.runInContext(`const module = {exports: null}; ${helper}\n${source}\nglobalThis.__adapter = module.exports;`, context, {filename: name + ".js"});
  assert.equal(typeof context.globalThis.__adapter, "function");
  return context.globalThis.__adapter;
}

function envelope(command, result, args = {}) {
  return buildSiteResultEnvelope({
    siteName: "parall",
    commandName: command,
    manifest,
    cmdMeta: manifest.commands[command],
    args,
    profile: "default",
    result,
    retrievedAt: "2026-08-16T00:00:00.000Z"
  });
}

test("Parall manifest exposes only authenticated read-only commands", () => {
  assert.equal(manifest.version, "0.1.3");
  const names = Object.keys(manifest.commands).sort();
  assert.deepEqual(names, ["agent-sessions", "agents", "chats", "inbox", "me", "members", "messages", "orgs", "project-summary", "projects", "tasks"]);
  for (const command of Object.values(manifest.commands)) {
    assert.equal(command.auth, "required");
    assert.equal(command.profile, "required");
    assert.equal(command.side_effect, "read_only");
    assert.equal(command.max_concurrency, 1);
    assert.equal(command.serialization_key, "site:parall:{profile}");
    assert.deepEqual(command.output_modes, ["legacy", "envelope_v1"]);
    assert.deepEqual(command.envelope_versions, [SITE_RESULT_ENVELOPE_VERSION]);
  }
  for (const name of ["projects", "project-summary", "tasks", "inbox", "chats", "messages", "members", "agents", "agent-sessions"]) {
    assert.equal(manifest.commands[name].params.org_id.required, true);
  }
});

test("Parall me and orgs return bounded session data without exposing email or token", async () => {
  const me = await loadAdapter("me");
  const meResult = await me({});
  const meData = unwrapSiteAdapterCarrier(meResult, manifest.commands.me);
  assert.equal(meData.user.id, "usr_me");
  assert.equal(meData.user.email, undefined);
  const meEnv = envelope("me", meResult);
  assert.equal(meEnv.status, "ok");
  assert.equal(meEnv.auth.authenticated_as, "unknown");
  assert.equal(JSON.stringify(meEnv).includes("jwt-fixture"), false);

  const orgs = await loadAdapter("orgs");
  const orgResult = await orgs({});
  const orgData = unwrapSiteAdapterCarrier(orgResult, manifest.commands.orgs);
  assert.equal(orgData.count, 2);
  assert.equal(orgData.orgs[0].id, "org_demo");
  assert.equal(orgData.orgs[0].role, "owner");
  assert.equal(capturedPageExpressions.some((expression) => expression.includes("localStorage") || expression.includes("Authorization")), false);
});

test("Parall projects, summary, tasks, members and agents require explicit org_id", async () => {
  const projects = await loadAdapter("projects");
  assert.equal((await projects({})).code, "INVALID_ARGUMENT");
  const projectResult = await projects({org_id: "org_demo"});
  const projectEnv = envelope("projects", projectResult, {org_id: "org_demo"});
  assert.equal(projectEnv.completeness, "complete");
  assert.equal(projectEnv.data.count, 2);
  assert.equal(projectEnv.command.effective_args.org_id, "org_demo");

  const summary = await loadAdapter("project-summary");
  const summaryResult = await summary({org_id: "org_demo"});
  assert.equal(envelope("project-summary", summaryResult, {org_id: "org_demo"}).data.workspace_counts.total, 5);

  const tasks = await loadAdapter("tasks");
  capturedRequests.length = 0;
  const taskResult = await tasks({org_id: "org_demo", assignee_id: "usr_me", limit: "10"});
  const taskEnv = envelope("tasks", taskResult, {org_id: "org_demo", assignee_id: "usr_me", limit: "10"});
  assert.equal(taskEnv.completeness, "partial");
  assert.equal(taskEnv.pagination.has_more, true);
  assert.equal(taskEnv.pagination.next_cursor, "task-cursor-secret");
  assert.equal(taskEnv.data.tasks.length, 2);
  const taskRequest = new URL(capturedRequests[capturedRequests.length - 1]);
  assert.equal(taskRequest.searchParams.get("parent_id"), "null");
  assert.equal(taskRequest.searchParams.get("scope"), "active");
  assert.equal(taskRequest.searchParams.get("limit"), "10");

  const members = await loadAdapter("members");
  assert.equal((await members({org_id: "org_demo"})).data.members.length, 2);
  const agents = await loadAdapter("agents");
  assert.equal((await agents({org_id: "org_demo"})).data.agents.length, 1);
});

test("Parall tasks support exact project and opaque cursor filters", async () => {
  const tasks = await loadAdapter("tasks");
  capturedRequests.length = 0;
  const result = await tasks({
    org_id: "org_demo",
    project_id: "prj_one",
    cursor: "task-cursor-secret",
    scope: "all",
    status: "todo",
    priority: "normal",
    creator_id: "usr_me",
    label_ids: "lbl_one,lbl_two",
    order: "desc",
    limit: "250"
  });
  const env = envelope("tasks", result, {org_id: "org_demo"});
  assert.equal(env.completeness, "partial");
  assert.equal(env.pagination.limit, 200);
  assert.equal(env.command.effective_args.project_id, "prj_one");
  assert.equal(env.command.effective_args.cursor, "task-cursor-secret");
  assert.equal(env.source.url.includes("task-cursor-secret"), false);
  const request = new URL(capturedRequests[capturedRequests.length - 1]);
  assert.equal(request.searchParams.get("project_id"), "prj_one");
  assert.equal(request.searchParams.get("cursor"), "task-cursor-secret");
  assert.equal(request.searchParams.get("limit"), "200");
  assert.equal(request.searchParams.get("scope"), "all");
  assert.equal(request.searchParams.get("order"), "desc");
});

test("Parall inbox, chats and messages preserve cursor pagination and redact it from source URL", async () => {
  const inbox = await loadAdapter("inbox");
  const inboxResult = await inbox({org_id: "org_demo", limit: "10", cursor: "inbox-cursor-secret", type: "mention", read: "false"});
  const inboxEnv = envelope("inbox", inboxResult, {org_id: "org_demo", limit: "10", cursor: "inbox-cursor-secret"});
  assert.equal(inboxEnv.completeness, "partial");
  assert.equal(inboxEnv.pagination.next_cursor, "inbox-cursor-secret");
  assert.equal(inboxEnv.source.url.includes("inbox-cursor-secret"), false);
  assert.equal(inboxEnv.command.effective_args.type, "mention");
  assert.equal(inboxEnv.command.effective_args.read, "false");

  const chats = await loadAdapter("chats");
  const chatResult = await chats({org_id: "org_demo", limit: "20", cursor: "chat-cursor-secret", scope: "all"});
  const chatEnv = envelope("chats", chatResult, {org_id: "org_demo", limit: "20"});
  assert.equal(chatEnv.data.chats[0].id, "cht_demo");
  assert.equal(chatEnv.command.effective_args.cursor, "chat-cursor-secret");
  assert.equal(chatEnv.command.effective_args.scope, "all");

  const messages = await loadAdapter("messages");
  const messageResult = await messages({org_id: "org_demo", chat_id: "cht_demo", before: "message-before-secret", thread_root_id: "msg_root", since: "2026-08-01"});
  const messageEnv = envelope("messages", messageResult, {org_id: "org_demo", chat_id: "cht_demo"});
  assert.equal(messageEnv.command.effective_args.before, "message-before-secret");
  assert.equal(messageEnv.command.effective_args.thread_root_id, "msg_root");
  assert.equal(messageEnv.source.url.includes("message-before-secret"), false);
  assert.equal(messageEnv.data.messages[0].id, "msg_one");
  assert.equal(messageEnv.pagination.has_more, true);

  const invalid = await messages({org_id: "org_demo", chat_id: "cht_demo", before: "before", after: "after"});
  assert.equal(invalid.code, "INVALID_ARGUMENT");
});

test("Parall agent sessions and authentication errors stay structured", async () => {
  const sessions = await loadAdapter("agent-sessions");
  const result = await sessions({org_id: "org_demo", agent_id: "usr_agent", status: "active", sort: "created_at"});
  const env = envelope("agent-sessions", result, {org_id: "org_demo", agent_id: "usr_agent", status: "active"});
  assert.equal(env.data.sessions[0].status, "active");
  assert.equal(env.completeness, "complete");

  const noSession = await loadAdapter("me", {browserEnabled: false});
  assert.equal((await noSession({})).code, "AUTH_REQUIRED");
  const apiError = await loadAdapter("me", {pageFetchImpl: async () => pageResponse({error: "unauthorized"}, false, 401)});
  assert.equal((await apiError({})).code, "AUTH_REQUIRED");
  const canonicalError = await loadAdapter("me", {pageFetchImpl: async () => pageResponse({error: {
    code: "PROJECT_SCOPE_UNAVAILABLE",
    message: "Project scope unavailable",
    status: 503,
    action: "read",
    resource_uri: "prll://org/org_demo/projects",
    approvable: false,
    details: {retry_token: "do-not-expose", reason: "fixture"}
  }}, false, 503, "4")});
  const decoded = await canonicalError({});
  assert.equal(decoded.code, "PROJECT_SCOPE_UNAVAILABLE");
  assert.equal(decoded.http_status, 503);
  assert.equal(decoded.action, "read");
  assert.equal(decoded.resource_uri, "prll://org/org_demo/projects");
  assert.equal(decoded.approvable, false);
  assert.equal(decoded.details.retry_token, "[redacted]");
  assert.equal(decoded.retry_after_seconds, 4);
  const networkError = await loadAdapter("me", {pageFetchImpl: async () => { throw new Error("offline"); }});
  assert.equal((await networkError({})).code, "NETWORK_ERROR");
});
