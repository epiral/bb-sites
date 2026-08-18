import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
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
const capturedMethods = [];
const capturedBodies = [];
const capturedHeaders = [];
const capturedPageExpressions = [];
const capturedAuthorization = [];
const pageStorageReads = [];
const openedTabs = [];
const closedTabs = [];

function pageResponse(body, ok = true, status = 200, retryAfter = null) {
  return {ok, status, retry_after: retryAfter, body: clone(body)};
}

const fixtureRoutes = new Map([
  ["/api/v1/users/me", "me"],
  ["/api/v1/orgs", "orgs"],
  ["/api/v1/orgs/org_demo", "org"],
  ["/api/v1/orgs/org_demo/members", "members"],
  ["/api/v1/orgs/org_demo/members/former", "former_members"],
  ["/api/v1/orgs/org_demo/members/usr_other/profile", "member_profile"],
  ["/api/v1/orgs/org_demo/members/usr_me/tasks", "member_tasks"],
  ["/api/v1/orgs/org_demo/members/usr_other/chats", "member_chats"],
  ["/api/v1/orgs/org_demo/projects", "projects"],
  ["/api/v1/orgs/org_demo/projects/task-summary", "project_summary"],
  ["/api/v1/orgs/org_demo/projects/library", "project_library"],
  ["/api/v1/orgs/org_demo/projects/prj_one", "project"],
  ["/api/v1/orgs/org_demo/projects/prj_one/join-requests", "project_join_requests"],
  ["/api/v1/orgs/org_demo/projects/prj_one/members", "project_members"],
  ["/api/v1/orgs/org_demo/projects/prj_one/readers", "project_readers"],
  ["/api/v1/orgs/org_demo/tasks", "tasks"],
  ["/api/v1/orgs/org_demo/tasks/subtask-summary", "subtask_summary"],
  ["/api/v1/orgs/org_demo/tasks/tsk_one", "task"],
  ["/api/v1/orgs/org_demo/tasks/tsk_one/subtasks", "task_subtasks"],
  ["/api/v1/orgs/org_demo/tasks/tsk_one/watchers", "task_watchers"],
  ["/api/v1/orgs/org_demo/tasks/tsk_one/relations", "task_relations"],
  ["PATCH /api/v1/orgs/org_demo/tasks/tsk_one", "task_updated"],
  ["POST /api/v1/orgs/org_demo/tasks", "subtask_created"],
  ["POST /api/v1/orgs/org_demo/comments", "task_comment"],
  ["/api/v1/orgs/org_demo/task-relations", "target_relations"],
  ["/api/v1/orgs/org_demo/inbox", "inbox"],
  ["/api/v1/orgs/org_demo/inbox/unread-count", "inbox_unread"],
  ["/api/v1/orgs/org_demo/chats", "chats"],
  ["/api/v1/orgs/org_demo/chats/discoverable", "discoverable_chats"],
  ["/api/v1/orgs/org_demo/chats/cht_demo", "chat"],
  ["/api/v1/orgs/org_demo/chats/cht_demo/members", "chat_members"],
  ["/api/v1/orgs/org_demo/chats/cht_demo/messages", "messages"],
  ["/api/v1/messages/msg_one", "message"],
  ["/api/v1/messages/msg_one/replies", "message_replies"],
  ["/api/v1/messages/msg_one/watchers", "message_watchers"],
  ["/api/v1/messages/msg_one/watching", "message_watching"],
  ["/api/v1/orgs/org_demo/agents", "agents"],
  ["/api/v1/orgs/org_demo/agents/usr_agent/instructions", "agent_instructions"],
  ["/api/v1/orgs/org_demo/agents/usr_agent/manager", "agent_manager"],
  ["/api/v1/orgs/org_demo/agents/usr_agent/tasks", "agent_tasks"],
  ["/api/v1/orgs/org_demo/agents/usr_agent/activity", "agent_activity"],
  ["/api/v1/orgs/org_demo/agents/usr_agent/monitor", "agent_monitor"],
  ["/api/v1/orgs/org_demo/agents/usr_agent/sessions", "sessions"],
  ["/api/v1/orgs/org_demo/agents/usr_agent/sessions/ses_one", "agent_session"],
  ["/api/v1/orgs/org_demo/agents/usr_agent/sessions/ses_one/steps", "agent_steps"],
  ["/api/v1/orgs/org_demo/agents/usr_agent/sessions/ses_one/steps/stp_one", "agent_step"]
]);

function fakePageFetch(url, init = {}) {
  const parsed = new URL(url);
  capturedRequests.push(String(url));
  const method = String(init.method || "GET").toUpperCase();
  const fixtureKey = fixtureRoutes.get(method + " " + parsed.pathname) || (method === "GET" ? fixtureRoutes.get(parsed.pathname) : null);
  if (fixtureKey) {
    const fixture = clone(fixtures[fixtureKey]);
    if (fixtureKey === "task_updated" && init.body) {
      Object.assign(fixture, init.body);
      if (Object.prototype.hasOwnProperty.call(init.body, "label_ids")) {
        fixture.labels = (init.body.label_ids || []).map((id) => ({id}));
        delete fixture.label_ids;
      }
    }
    return pageResponse(fixture, true, method === "POST" ? 201 : 200);
  }
  return pageResponse({error: "not found"}, false, 404);
}

async function executePageRequest(expression, pageFetchImpl, accessToken) {
  const originalFetch = async (input, init = {}) => {
    const headers = new Headers(init.headers || {});
    const method = String(init.method || "GET").toUpperCase();
    capturedAuthorization.push(headers.get("Authorization"));
    capturedMethods.push(method);
    capturedHeaders.push(Object.fromEntries(headers.entries()));
    capturedBodies.push(init.body === undefined ? undefined : JSON.parse(String(init.body)));
    assert.ok(["GET", "POST", "PATCH"].includes(method));
    assert.equal(init.credentials, "omit");
    assert.equal(init.redirect, "error");
    if (method === "GET") {
      assert.equal(init.body, undefined);
      assert.equal(headers.get("Content-Type"), null);
    } else {
      assert.equal(headers.get("Content-Type"), "application/json");
      assert.equal(typeof init.body, "string");
    }
    const result = await pageFetchImpl(String(input), {method, body: capturedBodies[capturedBodies.length - 1], headers});
    const body = clone(result.body);
    return {
      ok: result.ok,
      status: result.status,
      headers: {
        get: (name) => {
          const lower = String(name).toLowerCase();
          if (lower === "content-type") return "application/json";
          if (lower === "retry-after") return result.retry_after;
          return null;
        }
      },
      json: async () => clone(body),
      text: async () => JSON.stringify(body)
    };
  };
  const pageWindow = {
    fetch: originalFetch,
    localStorage: {
      getItem: (key) => {
        pageStorageReads.push(key);
        return key === "parall_access_token" ? accessToken : null;
      }
    }
  };
  return vm.runInNewContext(expression, {
    window: pageWindow,
    location: {origin: "https://app.parall.com", href: "https://app.parall.com/"},
    URL,
    AbortController,
    setTimeout,
    clearTimeout
  });
}

function fakeBrowser(pageFetchImpl, executeBridge = false, pageAccessToken = "fixture-only-secret") {
  return {
    open: async (url, options = {}) => {
      const tabNumber = openedTabs.length + 1;
      openedTabs.push({url, options});
      return {
      waitForSelector: async () => true,
      eval: async (expression) => {
        capturedPageExpressions.push(expression);
        if (executeBridge) return executePageRequest(expression, pageFetchImpl, pageAccessToken);
        const match = expression.match(/const targetPath = ("(?:\\.|[^"])*");/s);
        assert.ok(match, "page request expression must contain an explicit relative API path");
        const targetPath = JSON.parse(match[1]);
        const methodMatch = expression.match(/const requestMethod = ("(?:\\.|[^"])*");/s);
        const bodyMatch = expression.match(/const requestBody = ((?:null)|"(?:\\.|[^"])*");/s);
        const method = methodMatch ? JSON.parse(methodMatch[1]) : "GET";
        const serializedBody = bodyMatch ? JSON.parse(bodyMatch[1]) : null;
        try {
          return await pageFetchImpl("https://api.parall.com/api/v1" + targetPath, {
            method,
            body: serializedBody === null ? undefined : JSON.parse(serializedBody)
          });
        } catch (error) {
          return {ok: false, status: 0, network_error: String(error?.message || error)};
        }
      },
      close: async () => { closedTabs.push(tabNumber); }
    };
    }
  };
}

async function loadAdapter(name, {pageFetchImpl = fakePageFetch, browserEnabled = true, executeBridge = false, pageAccessToken = "fixture-only-secret"} = {}) {
  const helper = await readFile(join(REPO_ROOT, "parall", "_helper.js"), "utf8");
  const source = await readFile(join(REPO_ROOT, "parall", name + ".js"), "utf8");
  const context = vm.createContext({
    browser: browserEnabled ? fakeBrowser(pageFetchImpl, executeBridge, pageAccessToken) : undefined,
    console,
    URL,
    URLSearchParams,
    globalThis: {}
  });
  vm.runInContext(`const module = {exports: null}; ${helper}\n${source}\nglobalThis.__adapter = module.exports;`, context, {filename: name + ".js"});
  assert.equal(typeof context.globalThis.__adapter, "function");
  return context.globalThis.__adapter;
}

async function loadInlineAdapter(source, {pageFetchImpl = fakePageFetch, executeBridge = true} = {}) {
  const helper = await readFile(join(REPO_ROOT, "parall", "_helper.js"), "utf8");
  const context = vm.createContext({browser: fakeBrowser(pageFetchImpl, executeBridge), console, URL, URLSearchParams, globalThis: {}});
  vm.runInContext(`const module = {exports: null}; ${helper}\n${source}\nglobalThis.__adapter = module.exports;`, context, {filename: "inline-parall-adapter.js"});
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

function errorEnvelope(command, error, args = {}) {
  return buildSiteResultEnvelope({
    siteName: "parall",
    commandName: command,
    manifest,
    cmdMeta: manifest.commands[command],
    args,
    profile: "default",
    error,
    retrievedAt: "2026-08-16T00:00:00.000Z"
  });
}

async function captureAdapterError(run, expectedCode) {
  let caught;
  try {
    await run();
  } catch (error) {
    caught = error;
  }
  assert.ok(caught, "expected adapter command to throw");
  assert.equal(caught.code, expectedCode);
  return caught;
}

test("Parall manifest exposes 43 reads and three explicitly confirmed Task writes", async () => {
  assert.equal(manifest.version, "0.3.0");
  const names = Object.keys(manifest.commands).sort();
  const writeNames = ["subtask-create", "task-comment-add", "task-update"];
  assert.deepEqual(names, [
    "agent-activity", "agent-instructions", "agent-manager", "agent-monitor", "agent-session", "agent-session-steps",
    "agent-sessions", "agent-step", "agent-tasks", "agents", "chat", "chat-members", "chats", "discoverable-chats",
    "former-members", "inbox", "inbox-unread-count", "me", "member-chats", "member-profile", "member-tasks", "members",
    "message", "message-replies", "message-watchers", "message-watching", "messages", "org", "orgs", "project",
    "project-join-requests", "project-library", "project-members", "project-readers", "project-summary", "projects",
    "subtask-create", "target-task-relations", "task", "task-comment-add", "task-relations", "task-subtask-summary",
    "task-subtasks", "task-update", "task-watchers", "tasks"
  ]);
  for (const [name, command] of Object.entries(manifest.commands)) {
    assert.equal(command.auth, "required");
    assert.equal(command.profile, "required");
    assert.equal(command.side_effect, writeNames.includes(name) ? "write" : "read_only");
    assert.equal(command.retry_safety, writeNames.includes(name) ? "unsafe_no_auto_retry" : "safe_with_backoff");
    assert.equal(command.max_concurrency, 1);
    assert.equal(command.serialization_key, writeNames.includes(name) ? "site:parall:{profile}:tasks" : "site:parall:{profile}");
    assert.deepEqual(command.output_modes, ["legacy", "envelope_v1"]);
    assert.deepEqual(command.envelope_versions, [SITE_RESULT_ENVELOPE_VERSION]);
  }
  for (const name of names.filter((name) => !["me", "orgs", "message", "message-replies", "message-watchers", "message-watching"].includes(name))) {
    assert.equal(manifest.commands[name].params.org_id.required, true);
  }
  const implementationFiles = (await readdir(join(REPO_ROOT, "parall")))
    .filter((name) => name.endsWith(".js") && name !== "_helper.js")
    .map((name) => name.slice(0, -3))
    .sort();
  assert.deepEqual(implementationFiles, names);
  for (const name of implementationFiles) {
    const source = await readFile(join(REPO_ROOT, "parall", name + ".js"), "utf8");
    if (!writeNames.includes(name)) assert.doesNotMatch(source, /parallWrite\s*\(/);
    assert.doesNotMatch(source, /\b(?:click|fill|type|press)\s*\(/);
  }
  for (const excluded of ["agent-me", "agent-step-global", "clip-registry", "send-message", "task-create"]) {
    assert.equal(names.includes(excluded), false);
  }
});

test("Parall me and orgs return bounded session data without exposing email or token", async () => {
  openedTabs.length = 0;
  closedTabs.length = 0;
  capturedPageExpressions.length = 0;
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
  assert.equal(capturedPageExpressions.every((expression) => expression.includes('window.localStorage?.getItem("parall_access_token")')), true);
  assert.equal(capturedPageExpressions.some((expression) => expression.includes("parall_refresh_token")), false);
  assert.equal(capturedPageExpressions.every((expression) => expression.includes('credentials: "omit"') && expression.includes('redirect: "error"')), true);
  assert.equal(openedTabs.every((tab) => tab.url === "https://app.parall.com/"), true);
  assert.equal(closedTabs.length, openedTabs.length);
});

test("Parall page request keeps the access token inside the renderer", async () => {
  capturedRequests.length = 0;
  capturedAuthorization.length = 0;
  pageStorageReads.length = 0;
  const projects = await loadAdapter("projects", {executeBridge: true});
  const result = await projects({org_id: "org_demo"});
  const data = unwrapSiteAdapterCarrier(result, manifest.commands.projects);
  assert.equal(data.count, 2);
  assert.deepEqual(capturedRequests.slice(-1).map((url) => new URL(url).pathname), ["/api/v1/orgs/org_demo/projects"]);
  assert.deepEqual(capturedAuthorization, ["Bearer fixture-only-secret"]);
  assert.deepEqual(pageStorageReads, ["parall_access_token"]);
  assert.equal(JSON.stringify(result).includes("fixture-only-secret"), false);
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
  assert.equal(envelope("project-summary", summaryResult, {org_id: "org_demo"}).data.workspace_counts.all_issues, 5);

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

test("Parall organization, member and project detail commands decode source-exact shapes", async () => {
  const org = await loadAdapter("org");
  const orgEnv = envelope("org", await org({org_id: "org_demo"}), {org_id: "org_demo"});
  assert.equal(orgEnv.data.org.id, "org_demo");
  assert.equal(orgEnv.completeness, "complete");

  const formerMembers = await loadAdapter("former-members");
  const formerEnv = envelope("former-members", await formerMembers({org_id: "org_demo"}), {org_id: "org_demo"});
  assert.deepEqual(formerEnv.data.former_member_ids, ["usr_former"]);

  const profile = await loadAdapter("member-profile");
  const profileEnv = envelope("member-profile", await profile({org_id: "org_demo", user_id: "usr_other"}));
  assert.equal(profileEnv.data.profile.profile_version, 2);

  const instructions = await loadAdapter("agent-instructions");
  const instructionsEnv = envelope("agent-instructions", await instructions({org_id: "org_demo", agent_id: "usr_agent"}));
  assert.equal(instructionsEnv.data.instructions.version, 3);
  assert.equal(instructionsEnv.warnings.some((warning) => warning.code === "NO_STORE_RESPONSE"), true);

  const manager = await loadAdapter("agent-manager");
  assert.equal((await manager({org_id: "org_demo", agent_id: "usr_agent"})).data.manager.manager_user_id, "usr_me");

  for (const [name, args, key, expected] of [
    ["project-library", {org_id: "org_demo"}, "projects", "prj_library"],
    ["project-join-requests", {org_id: "org_demo", project_id: "prj_one"}, "join_requests", "apr_one"],
    ["project-members", {org_id: "org_demo", project_id: "prj_one"}, "members", "prj_one"],
    ["project-readers", {org_id: "org_demo", project_id: "prj_one"}, "readers", "usr_me"]
  ]) {
    const adapter = await loadAdapter(name);
    const data = unwrapSiteAdapterCarrier(await adapter(args), manifest.commands[name]);
    const first = data[key][0];
    assert.equal(typeof first === "string" ? first : first.id || first.project_id, expected);
  }

  const project = await loadAdapter("project");
  const projectData = unwrapSiteAdapterCarrier(await project({org_id: "org_demo", project_id: "prj_one"}), manifest.commands.project);
  assert.equal(projectData.project.description, "Fixture project detail");
});

test("Parall task and inbox detail commands preserve filters, cursors and fixed pending views", async () => {
  const task = await loadAdapter("task");
  assert.equal((await task({org_id: "org_demo", task_id: "tsk_one"})).data.task.identifier, "FP-1");

  const summary = await loadAdapter("task-subtask-summary");
  capturedRequests.length = 0;
  const summaryResult = await summary({org_id: "org_demo", assignee_id: "usr_me", project_id: "prj_one"});
  assert.equal(summaryResult.data.summaries[0].total, 3);
  const summaryRequest = new URL(capturedRequests[capturedRequests.length - 1]);
  assert.equal(summaryRequest.searchParams.get("assignee_id"), "usr_me");
  assert.equal(summaryRequest.searchParams.get("project_id"), "prj_one");

  const subtasks = await loadAdapter("task-subtasks");
  const subtaskEnv = envelope("task-subtasks", await subtasks({org_id: "org_demo", task_id: "tsk_one", limit: "999", cursor: "subtask-secret"}));
  assert.equal(subtaskEnv.command.effective_args.limit, 200);
  assert.equal(subtaskEnv.data.tasks[0].parent_id, "tsk_one");
  assert.equal(subtaskEnv.source.url.includes("subtask-secret"), false);

  for (const [name, args, key] of [
    ["task-watchers", {org_id: "org_demo", task_id: "tsk_one"}, "watchers"],
    ["task-relations", {org_id: "org_demo", task_id: "tsk_one"}, "relations"],
    ["target-task-relations", {org_id: "org_demo", target_type: "message", target_id: "msg_one"}, "relations"],
    ["member-tasks", {org_id: "org_demo", member_id: "usr_me"}, "tasks"],
    ["agent-tasks", {org_id: "org_demo", agent_id: "usr_agent"}, "tasks"]
  ]) {
    const adapter = await loadAdapter(name);
    const data = unwrapSiteAdapterCarrier(await adapter(args), manifest.commands[name]);
    assert.equal(data[key].length, 1);
  }

  const unread = await loadAdapter("inbox-unread-count");
  const unreadData = unwrapSiteAdapterCarrier(await unread({org_id: "org_demo"}), manifest.commands["inbox-unread-count"]);
  assert.equal(unreadData.unread.count, 3);
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

test("Parall task-update sends a narrow confirmed PATCH with explicit clear semantics", async () => {
  const update = await loadAdapter("task-update", {executeBridge: true});
  openedTabs.length = 0;
  await captureAdapterError(() => update({org_id: "org_demo", task_id: "tsk_one", status: "done"}), "CONFIRMATION_REQUIRED");
  assert.equal(openedTabs.length, 0);
  await captureAdapterError(() => update({org_id: "org_demo", task_id: "tsk_one", status: "invalid", confirm: "write"}), "INVALID_ARGUMENT");
  await captureAdapterError(() => update({org_id: "org_demo", task_id: "tsk_one", due_date: "2026-02-30", confirm: "write"}), "INVALID_ARGUMENT");
  await captureAdapterError(() => update({org_id: "org_demo", task_id: "tsk_one", assignee_id: "usr_me", clear_assignee: true, confirm: "write"}), "INVALID_ARGUMENT");
  await captureAdapterError(() => update({org_id: "org_demo", task_id: "tsk_one", project_id: "prj_two", confirm: "write"}), "UNSUPPORTED_MUTATION");
  await captureAdapterError(() => update({org_id: "org_demo", task_id: "tsk_one", confirm: "write"}), "INVALID_ARGUMENT");
  assert.equal(openedTabs.length, 0);

  capturedMethods.length = 0;
  capturedBodies.length = 0;
  capturedAuthorization.length = 0;
  pageStorageReads.length = 0;
  const result = await update({
    org_id: "org_demo",
    task_id: "tsk_one",
    title: "Renamed gate",
    status: "in_review",
    priority: "high",
    description: "Receipt gate",
    clear_assignee: true,
    clear_due_date: true,
    clear_labels: true,
    clear_parent: true,
    confirm: "write"
  });
  const env = envelope("task-update", result, {org_id: "org_demo", task_id: "tsk_one", description: "Receipt gate", confirm: "write"});
  assert.equal(env.status, "ok");
  assert.equal(env.completeness, "complete");
  assert.equal(env.reason, "mutation_confirmed");
  assert.equal(env.data.task.id, "tsk_one");
  assert.equal(env.command.requested_args.description, undefined);
  assert.equal(env.command.effective_args.description, undefined);
  assert.equal(env.runtime.manifest_metadata.side_effect, "write");
  assert.equal(env.runtime.manifest_metadata.retry_safety, "unsafe_no_auto_retry");
  assert.equal(env.receipts[0].method, "PATCH");
  assert.equal(env.receipts[0].resource_id, "tsk_one");
  assert.equal(env.warnings.some((warning) => warning.code === "TASK_UPDATE_FANOUT"), true);
  assert.deepEqual(capturedMethods, ["PATCH"]);
  assert.deepEqual(capturedBodies, [{
    title: "Renamed gate",
    status: "in_review",
    priority: "high",
    description: "Receipt gate",
    assignee_id: null,
    due_date: null,
    label_ids: null,
    parent_id: null
  }]);
  assert.deepEqual(pageStorageReads, ["parall_access_token"]);
  assert.deepEqual(capturedAuthorization, ["Bearer fixture-only-secret"]);
  assert.equal(JSON.stringify(result).includes("fixture-only-secret"), false);
  assert.equal(unwrapSiteAdapterCarrier(result, manifest.commands["task-update"]).task.id, "tsk_one");
});

test("Parall task-update can assign, date, label, and re-parent an existing Subtask", async () => {
  const update = await loadAdapter("task-update", {executeBridge: true});
  capturedBodies.length = 0;
  const result = await update({
    org_id: "org_demo",
    task_id: "tsk_one",
    assignee_id: "usr_other",
    due_date: "2026-08-31",
    label_ids: "lbl_one,lbl_two,lbl_one",
    parent_id: "tsk_parent",
    confirm: "write"
  });
  assert.equal(result.data.task.id, "tsk_one");
  assert.deepEqual(capturedBodies.slice(-1)[0], {
    assignee_id: "usr_other",
    due_date: "2026-08-31",
    label_ids: ["lbl_one", "lbl_two"],
    parent_id: "tsk_parent"
  });
});

test("Parall subtask-create sends the source-exact POST and reports non-idempotency", async () => {
  const create = await loadAdapter("subtask-create", {executeBridge: true});
  openedTabs.length = 0;
  await captureAdapterError(() => create({org_id: "org_demo", project_id: "prj_one", parent_id: "tsk_one", title: "Run smoke"}), "CONFIRMATION_REQUIRED");
  assert.equal(openedTabs.length, 0);

  capturedMethods.length = 0;
  capturedBodies.length = 0;
  const result = await create({
    org_id: "org_demo",
    project_id: "prj_one",
    parent_id: "tsk_one",
    title: "Run packaged smoke",
    description: "Fixture-only Subtask",
    status: "todo",
    priority: "normal",
    assignee_id: "usr_other",
    due_date: "2026-08-31",
    label_ids: "lbl_one,lbl_two",
    confirm: "write"
  });
  const env = envelope("subtask-create", result, {org_id: "org_demo", project_id: "prj_one", parent_id: "tsk_one", title: "Run packaged smoke", confirm: "write"});
  assert.equal(env.data.task.id, "tsk_created");
  assert.equal(env.data.task.parent_id, "tsk_one");
  assert.equal(env.receipts[0].http_status, 201);
  assert.equal(env.warnings.some((warning) => warning.code === "NON_IDEMPOTENT_CREATE"), true);
  assert.equal(env.warnings.some((warning) => warning.code === "TASK_CREATE_FANOUT"), true);
  assert.deepEqual(capturedMethods, ["POST"]);
  assert.deepEqual(capturedBodies, [{
    title: "Run packaged smoke",
    project_id: "prj_one",
    parent_id: "tsk_one",
    description: "Fixture-only Subtask",
    status: "todo",
    priority: "normal",
    assignee_id: "usr_other",
    due_date: "2026-08-31",
    label_ids: ["lbl_one", "lbl_two"]
  }]);
});

test("Parall task-comment-add sends one bounded POST and redacts comment args from envelope metadata", async () => {
  const addComment = await loadAdapter("task-comment-add", {executeBridge: true});
  openedTabs.length = 0;
  await captureAdapterError(() => addComment({org_id: "org_demo", task_id: "tsk_one", body: "Receipt"}), "CONFIRMATION_REQUIRED");
  await captureAdapterError(() => addComment({org_id: "org_demo", task_id: "tsk_one", body: " ", confirm: "write"}), "INVALID_ARGUMENT");
  await captureAdapterError(() => addComment({org_id: "org_demo", task_id: "tsk_one", body: "界".repeat(22000), confirm: "write"}), "INVALID_ARGUMENT");
  assert.equal(openedTabs.length, 0);

  capturedMethods.length = 0;
  capturedBodies.length = 0;
  const result = await addComment({org_id: "org_demo", task_id: "tsk_one", body: "Receipt: prll://msg_fixture", confirm: "write"});
  const env = envelope("task-comment-add", result, {org_id: "org_demo", task_id: "tsk_one", body: "Receipt: prll://msg_fixture", confirm: "write"});
  assert.equal(env.data.comment.id, "cmt_receipt");
  assert.equal(env.command.requested_args.body, undefined);
  assert.equal(env.command.effective_args.body, undefined);
  assert.equal(env.warnings.some((warning) => warning.code === "NON_IDEMPOTENT_COMMENT"), true);
  assert.equal(env.warnings.some((warning) => warning.code === "COMMENT_FANOUT"), true);
  assert.deepEqual(capturedMethods, ["POST"]);
  assert.deepEqual(capturedBodies, [{target_uri: "prll://tsk_one", body: "Receipt: prll://msg_fixture"}]);
});

test("Parall writes fail closed on paths and never auto-retry an unknown outcome", async () => {
  openedTabs.length = 0;
  const forbidden = await loadInlineAdapter('module.exports = async function() { return parallThrow((await parallWrite("/orgs/org_demo/members", "POST", {role:"owner"})).result); };');
  await captureAdapterError(() => forbidden({}), "WRITE_PATH_NOT_ALLOWED");
  assert.equal(openedTabs.length, 0);

  let attempts = 0;
  const create = await loadAdapter("subtask-create", {
    executeBridge: true,
    pageFetchImpl: async () => {
      attempts += 1;
      throw new Error("fixture disconnect");
    }
  });
  const unknown = await captureAdapterError(
    () => create({org_id: "org_demo", project_id: "prj_one", parent_id: "tsk_one", title: "One attempt", confirm: "write"}),
    "OUTCOME_UNKNOWN"
  );
  assert.equal(unknown.details.outcome, "unknown");
  assert.equal(unknown.details.manual_verification_required, true);
  const unknownEnv = errorEnvelope("subtask-create", unknown, {org_id: "org_demo", project_id: "prj_one", parent_id: "tsk_one", title: "One attempt", confirm: "write"});
  assert.equal(unknownEnv.status, "error");
  assert.equal(unknownEnv.completeness, "unknown");
  assert.equal(unknownEnv.reason, "outcome_unknown");
  assert.equal(unknownEnv.error.details.manual_verification_required, true);
  assert.equal(attempts, 1);

  const staleSuccess = await loadAdapter("task-update", {
    executeBridge: true,
    pageFetchImpl: async () => pageResponse(fixtures.task, true, 200)
  });
  await captureAdapterError(
    () => staleSuccess({org_id: "org_demo", task_id: "tsk_one", title: "Expected new title", confirm: "write"}),
    "OUTCOME_UNKNOWN"
  );

  const conflict = await loadAdapter("task-update", {
    executeBridge: true,
    pageFetchImpl: async () => pageResponse({error: {code: "STALE_GENERATION", message: "Stale generation", status: 409}}, false, 409)
  });
  const conflictResult = await captureAdapterError(
    () => conflict({org_id: "org_demo", task_id: "tsk_one", status: "done", confirm: "write"}),
    "STALE_GENERATION"
  );
  assert.equal(conflictResult.details.http_status, 409);
  assert.match(conflictResult.hint, /Do not automatically retry/);
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

test("Parall chat and global message reads expose exact continuation limits", async () => {
  const discoverable = await loadAdapter("discoverable-chats");
  const discoverableEnv = envelope("discoverable-chats", await discoverable({org_id: "org_demo", q: "private query", limit: "20"}));
  assert.equal(discoverableEnv.data.chats[0].id, "cht_public");
  assert.equal(discoverableEnv.source.url.includes("private%20query"), false);
  assert.equal(discoverableEnv.source.url.includes("private+query"), false);

  for (const [name, args, key] of [
    ["chat", {org_id: "org_demo", chat_id: "cht_demo"}, "chat"],
    ["chat-members", {org_id: "org_demo", chat_id: "cht_demo"}, "members"],
    ["member-chats", {org_id: "org_demo", member_id: "usr_other"}, "chats"],
    ["message", {message_id: "msg_one"}, "message"],
    ["message-watchers", {message_id: "msg_one"}, "watchers"]
  ]) {
    const adapter = await loadAdapter(name);
    const data = unwrapSiteAdapterCarrier(await adapter(args), manifest.commands[name]);
    assert.ok(data[key]);
  }

  const watching = await loadAdapter("message-watching");
  assert.equal((await watching({message_id: "msg_one"})).data.watching.watching, true);

  const replies = await loadAdapter("message-replies");
  const repliesEnv = envelope("message-replies", await replies({message_id: "msg_one", limit: "25"}));
  assert.equal(repliesEnv.completeness, "partial");
  assert.equal(repliesEnv.reason, "pagination_cursor_unavailable");
  assert.equal(repliesEnv.pagination.has_more, true);
  assert.equal(repliesEnv.pagination.next_cursor, undefined);
  assert.equal(repliesEnv.warnings.some((warning) => warning.code === "PAGINATION_CURSOR_UNAVAILABLE"), true);
});

test("Parall agent sessions and authentication errors stay structured", async () => {
  const sessions = await loadAdapter("agent-sessions");
  const result = await sessions({org_id: "org_demo", agent_id: "usr_agent", status: "active", sort: "created_at"});
  const env = envelope("agent-sessions", result, {org_id: "org_demo", agent_id: "usr_agent", status: "active"});
  assert.equal(env.data.sessions[0].status, "active");
  assert.equal(env.completeness, "complete");

  const noSession = await loadAdapter("me", {browserEnabled: false});
  assert.equal((await noSession({})).code, "AUTH_REQUIRED");
  const noPageToken = await loadAdapter("me", {executeBridge: true, pageAccessToken: null});
  assert.equal((await noPageToken({})).code, "AUTH_REQUIRED");
  const unavailableStorage = await loadAdapter("me", {pageFetchImpl: async () => ({ok: false, status: 0, bridge_error: "PAGE_CREDENTIAL_STORAGE_UNAVAILABLE"})});
  assert.equal((await unavailableStorage({})).code, "AUTH_REQUIRED");
  const unsupportedOrigin = await loadAdapter("me", {pageFetchImpl: async () => ({ok: false, status: 0, bridge_error: "UNSUPPORTED_PARALL_APP_ORIGIN"})});
  assert.equal((await unsupportedOrigin({})).code, "EDGE_ERROR");
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

test("Parall Agent monitor, activity, sessions and steps preserve governance boundaries", async () => {
  const activity = await loadAdapter("agent-activity");
  const activityEnv = envelope("agent-activity", await activity({org_id: "org_demo", agent_id: "usr_agent", limit: "500"}));
  assert.equal(activityEnv.command.effective_args.limit, 200);
  assert.equal(activityEnv.data.messages[0].sender_id, "usr_agent");

  const monitor = await loadAdapter("agent-monitor");
  const monitorEnv = envelope("agent-monitor", await monitor({org_id: "org_demo", agent_id: "usr_agent"}));
  assert.equal(monitorEnv.data.monitor.status, "busy");
  assert.equal(monitorEnv.data.monitor.telemetry.provider_api_key, "[redacted]");

  const sessions = await loadAdapter("agent-sessions");
  capturedRequests.length = 0;
  const sessionsEnv = envelope("agent-sessions", await sessions({org_id: "org_demo", agent_id: "usr_agent"}));
  const sessionsRequest = new URL(capturedRequests[capturedRequests.length - 1]);
  assert.equal(sessionsRequest.searchParams.has("status"), false);
  assert.equal(sessionsEnv.command.effective_args.status, undefined);
  assert.equal(sessionsEnv.warnings.some((warning) => warning.code === "GOVERNANCE_ENUMERATION_REQUIRED"), true);

  const session = await loadAdapter("agent-session");
  const sessionEnv = envelope("agent-session", await session({org_id: "org_demo", agent_id: "usr_agent", session_id: "ses_one"}));
  assert.equal(sessionEnv.data.session.id, "ses_one");
  assert.equal(sessionEnv.warnings.some((warning) => warning.code === "CONTEXT_REDACTION_POSSIBLE"), true);

  const steps = await loadAdapter("agent-session-steps");
  const stepsEnv = envelope("agent-session-steps", await steps({org_id: "org_demo", agent_id: "usr_agent", session_id: "ses_one", limit: "5000", cursor: "step-cursor-secret"}));
  assert.equal(stepsEnv.command.effective_args.limit, 1000);
  assert.equal(stepsEnv.pagination.next_cursor, "step-cursor-secret");
  assert.equal(stepsEnv.data.steps[0].content.provider_token, "[redacted]");
  assert.equal(stepsEnv.source.url.includes("step-cursor-secret"), false);

  const step = await loadAdapter("agent-step");
  const stepEnv = envelope("agent-step", await step({org_id: "org_demo", agent_id: "usr_agent", session_id: "ses_one", step_id: "stp_one"}));
  assert.equal(stepEnv.data.step.content.authorization, "[redacted]");
});

test("Parall malformed success responses are errors rather than false empty results", async () => {
  const malformedList = await loadAdapter("orgs", {pageFetchImpl: async () => pageResponse({})});
  const listResult = await malformedList({});
  assert.equal(listResult.code, "INVALID_RESPONSE");

  const malformedObject = await loadAdapter("org", {pageFetchImpl: async () => pageResponse([])});
  const objectResult = await malformedObject({org_id: "org_demo"});
  assert.equal(objectResult.code, "INVALID_RESPONSE");

  const missing = await loadAdapter("agent-step");
  assert.equal((await missing({org_id: "org_demo", agent_id: "usr_agent", session_id: "ses_one"})).code, "INVALID_ARGUMENT");
});
