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

function response(body, ok = true, status = 200) {
  return {ok, status, json: async () => clone(body)};
}

function fakeFetch(url, options = {}) {
  const parsed = new URL(url);
  assert.equal(options.headers?.Authorization, "jwt-fixture");
  const path = parsed.pathname;
  if (path === "/api/v1/users/me") return Promise.resolve(response(fixtures.me));
  if (path === "/api/v1/orgs") return Promise.resolve(response(fixtures.orgs));
  if (path.endsWith("/projects/task-summary")) return Promise.resolve(response(fixtures.project_summary));
  if (path.endsWith("/projects")) return Promise.resolve(response(fixtures.projects));
  if (path.endsWith("/tasks/subtask-summary")) return Promise.resolve(response({data: [{task_id: "tsk_one", done: 1, total: 3}]}));
  if (path.endsWith("/tasks")) return Promise.resolve(response(fixtures.tasks));
  if (path.endsWith("/inbox")) return Promise.resolve(response(fixtures.inbox));
  if (path.endsWith("/chats")) return Promise.resolve(response(fixtures.chats));
  if (path.endsWith("/messages")) return Promise.resolve(response(fixtures.messages));
  if (path.endsWith("/members")) return Promise.resolve(response(fixtures.members));
  if (path.endsWith("/agents")) return Promise.resolve(response(fixtures.agents));
  if (path.endsWith("/sessions")) return Promise.resolve(response(fixtures.sessions));
  return Promise.resolve(response({error: "not found"}, false, 404));
}

async function loadAdapter(name, {token = "jwt-fixture", fetchImpl = fakeFetch} = {}) {
  const helper = await readFile(join(REPO_ROOT, "parall", "_helper.js"), "utf8");
  const source = await readFile(join(REPO_ROOT, "parall", name + ".js"), "utf8");
  const context = vm.createContext({
    fetch: fetchImpl,
    localStorage: {getItem: (key) => key === "parall_access_token" ? token : null},
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
  const taskResult = await tasks({org_id: "org_demo", assignee_id: "usr_me", limit: "10"});
  const taskEnv = envelope("tasks", taskResult, {org_id: "org_demo", assignee_id: "usr_me", limit: "10"});
  assert.equal(taskEnv.completeness, "partial");
  assert.equal(taskEnv.pagination.has_more, true);
  assert.equal(taskEnv.pagination.next_cursor, "task-cursor-secret");
  assert.equal(taskEnv.data.tasks.length, 2);

  const members = await loadAdapter("members");
  assert.equal((await members({org_id: "org_demo"})).data.members.length, 2);
  const agents = await loadAdapter("agents");
  assert.equal((await agents({org_id: "org_demo"})).data.agents.length, 1);
});

test("Parall inbox, chats and messages preserve cursor pagination and redact it from source URL", async () => {
  const inbox = await loadAdapter("inbox");
  const inboxResult = await inbox({org_id: "org_demo", limit: "10", cursor: "inbox-cursor-secret"});
  const inboxEnv = envelope("inbox", inboxResult, {org_id: "org_demo", limit: "10", cursor: "inbox-cursor-secret"});
  assert.equal(inboxEnv.completeness, "partial");
  assert.equal(inboxEnv.pagination.next_cursor, "inbox-cursor-secret");
  assert.equal(inboxEnv.source.url.includes("inbox-cursor-secret"), false);

  const chats = await loadAdapter("chats");
  const chatResult = await chats({org_id: "org_demo", limit: "20"});
  assert.equal(envelope("chats", chatResult, {org_id: "org_demo", limit: "20"}).data.chats[0].id, "cht_demo");

  const messages = await loadAdapter("messages");
  const messageResult = await messages({org_id: "org_demo", chat_id: "cht_demo", top_level: "false"});
  const messageEnv = envelope("messages", messageResult, {org_id: "org_demo", chat_id: "cht_demo", top_level: "false"});
  assert.equal(messageEnv.command.effective_args.top_level, false);
  assert.equal(messageEnv.data.messages[0].id, "msg_one");
  assert.equal(messageEnv.pagination.has_more, true);
});

test("Parall agent sessions and authentication errors stay structured", async () => {
  const sessions = await loadAdapter("agent-sessions");
  const result = await sessions({org_id: "org_demo", agent_id: "usr_agent", status: "active"});
  const env = envelope("agent-sessions", result, {org_id: "org_demo", agent_id: "usr_agent", status: "active"});
  assert.equal(env.data.sessions[0].status, "active");
  assert.equal(env.completeness, "complete");

  const noSession = await loadAdapter("me", {token: null});
  assert.equal((await noSession({})).code, "AUTH_REQUIRED");
  const apiError = await loadAdapter("me", {fetchImpl: async () => response({error: "unauthorized"}, false, 401)});
  assert.equal((await apiError({})).code, "AUTH_REQUIRED");
  const networkError = await loadAdapter("me", {fetchImpl: async () => { throw new Error("offline"); }});
  assert.equal((await networkError({})).code, "NETWORK_ERROR");
});
