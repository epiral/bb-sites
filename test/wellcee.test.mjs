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
  throw new Error("Test setup error: PINIX_EDGE_REPO=" + edgeRepo + " is not a valid Edge Stage3 checkout; expected main/site-envelope.mjs.");
}
const { buildSiteResultEnvelope, unwrapSiteAdapterCarrier, SITE_RESULT_ENVELOPE_VERSION } = await import(pathToFileURL(envelopePath).href);

const TEST_DIR = resolve(fileURLToPath(new URL(".", import.meta.url)));
const REPO_ROOT = resolve(TEST_DIR, "..");

async function fixture(name) {
  return JSON.parse(await readFile(join(REPO_ROOT, "fixtures", "wellcee", name), "utf8"));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

async function loadAdapter(file, pageOrError) {
  const source = await readFile(join(REPO_ROOT, "wellcee", file), "utf8");
  const browser = {
    async open() {
      if (pageOrError instanceof Error) throw pageOrError;
      return {
        async waitForSelector() {},
        async eval() { return clone(pageOrError); }
      };
    }
  };
  const context = vm.createContext({browser, URL, console, globalThis: {}});
  vm.runInContext(`const module = {exports: null}; ${source}; globalThis.__adapter = module.exports;`, context, {filename: file});
  assert.equal(typeof context.globalThis.__adapter, "function");
  return context.globalThis.__adapter;
}

function envelope(siteName, commandName, manifest, result, args) {
  return buildSiteResultEnvelope({
    siteName,
    commandName,
    manifest,
    cmdMeta: manifest.commands[commandName],
    args,
    profile: "wellcee-test",
    result,
    retrievedAt: "2026-08-13T00:00:00.000Z"
  });
}

const manifest = JSON.parse(await readFile(join(REPO_ROOT, "wellcee", "site.json"), "utf8"));

test("Wellcee manifest declares only read-only search/detail with envelope v1", () => {
  assert.deepEqual(Object.keys(manifest.commands).sort(), ["detail", "search"]);
  assert.ok(manifest.commands.detail.params["listing-id"]);
  for (const command of Object.values(manifest.commands)) {
    assert.equal(command.auth, "none");
    assert.equal(command.profile, "required");
    assert.equal(command.side_effect, "read_only");
    assert.equal(command.max_concurrency, 1);
    assert.deepEqual(command.output_modes, ["legacy", "envelope_v1"]);
    assert.deepEqual(command.envelope_versions, [SITE_RESULT_ENVELOPE_VERSION]);
  }
});

test("Wellcee search parses first-page JSON-LD and returns partial carrier", async () => {
  const pages = await fixture("list.json");
  const adapter = await loadAdapter("search.js", pages.normal);
  const args = {city: "上海", limit: "2"};
  const result = await adapter(args);
  const legacy = unwrapSiteAdapterCarrier(result, manifest.commands.search);
  assert.equal(legacy.count, 2);
  assert.equal(legacy.listings[0].listing_id, "1001");
  assert.equal(legacy.listings[0].price, 7800);
  assert.equal(legacy.listings[0].district, "徐汇");
  assert.equal(legacy.listings[0].role_hint, "self_claim");
  assert.match(legacy.listings[0].source_url, /^https:\/\/www\.wellcee\.com\/cn\/rent-apartment\/shanghai\/1001$/);
  assert.equal(result.__pinix_site_result.metadata.completeness, "partial");
  assert.equal(result.__pinix_site_result.metadata.reason, "first_page_only");
  const env = envelope("wellcee", "search", manifest, result, args);
  assert.equal(env.status, "ok");
  assert.equal(env.completeness, "partial");
  assert.equal(env.reason, "first_page_only");
  assert.equal(env.command.effective_args.limit, 2);
  assert.equal(env.source.url, "https://www.wellcee.com/cn/rent-apartment/shanghai/list");
  assert.equal(env.auth.requirement, "none");
  assert.equal(env.auth.authenticated_as, "not_applicable");
  assert.equal(env.runtime.profile, "wellcee-test");
});

test("Wellcee search applies query/district locally and does not guess unknown area/type", async () => {
  const pages = await fixture("list.json");
  const adapter = await loadAdapter("search.js", pages.normal);
  const district = await adapter({city: "上海", district: "徐汇区", query: "漕溪", limit: 20});
  const districtData = unwrapSiteAdapterCarrier(district, manifest.commands.search);
  assert.equal(districtData.count, 1);
  assert.equal(districtData.listings[0].community, "漕溪小区");

  const share = await adapter({city: "上海", property_type: "share", limit: 20});
  assert.equal(share.data.count, 1);
  assert.equal(share.data.listings[0].room_type, "合租");

  const unknownArea = await adapter({city: "上海", min_area: 40});
  const unknownAreaData = unwrapSiteAdapterCarrier(unknownArea, manifest.commands.search);
  assert.equal(unknownAreaData.count, 0);
  assert.equal(unknownArea.__pinix_site_result.metadata.completeness, "partial");
  assert.equal(unknownArea.__pinix_site_result.metadata.reason, "no_verified_match");
  assert.equal(unknownArea.__pinix_site_result.metadata.pagination.filter_unknown_area, 3);
  assert.equal(unknownArea.__pinix_site_result.metadata.warnings.some(w => w.code === "NO_VERIFIED_MATCH"), true);

  const unknownType = await adapter({city: "上海", property_type: "whole"});
  assert.equal(unknownType.data.count, 0);
  assert.equal(unknownType.__pinix_site_result.metadata.pagination.filter_unknown_property_type, 2);
});

test("Wellcee search preserves proven empty, blocked and invalid paths", async () => {
  const pages = await fixture("list.json");
  const emptyAdapter = await loadAdapter("search.js", pages.empty);
  const empty = await emptyAdapter({city: "上海"});
  assert.equal(empty.__pinix_site_result.metadata.completeness, "empty");
  assert.equal(empty.__pinix_site_result.metadata.reason, "no_results");
  assert.equal(empty.data.count, 0);

  const blockedAdapter = await loadAdapter("search.js", pages.blocked);
  assert.equal((await blockedAdapter({city: "上海"})).code, "BLOCKED");

  const adapter = await loadAdapter("search.js", pages.normal);
  assert.equal((await adapter({city: "Atlantis"})).code, "INVALID_ARGUMENT");
  assert.equal((await adapter({city: "上海", min_price: 9000, max_price: 1000})).code, "INVALID_ARGUMENT");
});

test("Wellcee detail parses JSON-LD and keeps sensitive URL/query and unknown fields bounded", async () => {
  const pages = await fixture("detail.json");
  const adapter = await loadAdapter("detail.js", pages.normal);
  const args = {url: "https://www.wellcee.com/cn/rent-apartment/shanghai/1001?token=secret#fragment"};
  const result = await adapter(args);
  const legacy = unwrapSiteAdapterCarrier(result, manifest.commands.detail);
  assert.equal(legacy.listing.listing_id, "1001");
  assert.equal(legacy.listing.price, 7800);
  assert.equal(legacy.listing.area_m2, 40);
  assert.equal(legacy.listing.floor, "5");
  assert.equal(legacy.listing.bathrooms, 1);
  assert.deepEqual(legacy.listing.amenities, ["厨房", "空调"]);
  assert.equal(legacy.listing.role_hint, "self_claim");
  assert.equal(legacy.listing.source_url, "https://www.wellcee.com/rent-apartment/1001");
  assert.equal(legacy.listing.profile_url, "https://www.wellcee.com/user/9001");
  assert.equal(legacy.listing.phone, null);
  assert.equal(legacy.listing.updated_at, null);
  assert.equal(result.__pinix_site_result.metadata.effective_args.url, "https://www.wellcee.com/rent-apartment/1001");
  const env = envelope("wellcee", "detail", manifest, result, args);
  assert.equal(env.status, "ok");
  assert.equal(env.completeness, "complete");
  assert.equal(env.source.url, "https://www.wellcee.com/rent-apartment/1001");
  assert.equal(JSON.stringify(env).includes("secret"), false);
  assert.equal(JSON.stringify(env).includes("fragment"), false);
  assert.equal(env.warnings.some(w => w.code === "ROLE_HINT_SELF_CLAIM"), true);
});

test("Wellcee detail accepts numeric ID, rejects invalid/unknown pages, and preserves network errors", async () => {
  const pages = await fixture("detail.json");
  const adapter = await loadAdapter("detail.js", pages.normal);
  const result = await adapter({listing_id: 1001});
  assert.equal(result.data.listing.listing_id, "1001");
  const hyphenated = await adapter({"listing-id": 1001});
  assert.equal(hyphenated.data.listing.listing_id, "1001");
  assert.deepEqual((await adapter({url: "https://example.com/rent-apartment/1001"})).code, "INVALID_ARGUMENT");
  assert.deepEqual((await adapter({listing_id: "abc"})).code, "INVALID_ARGUMENT");

  const notFoundAdapter = await loadAdapter("detail.js", pages.not_found);
  assert.equal((await notFoundAdapter({listing_id: "9999"})).code, "NOT_FOUND");

  const networkAdapter = await loadAdapter("detail.js", new Error("edge disconnected"));
  assert.equal((await networkAdapter({listing_id: "1001"})).code, "NETWORK_ERROR");
});
