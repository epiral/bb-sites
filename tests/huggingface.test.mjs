import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

function toPlain(value) {
  return JSON.parse(JSON.stringify(value));
}

async function loadAdapter(relativePath, extraContext = {}) {
  const filePath = path.join(repoRoot, relativePath);
  const source = await readFile(filePath, "utf8");
  const functionSource = source.replace(/^\/\*[\s\S]*?\*\/\s*/, "").trim();
  const context = vm.createContext({
    encodeURIComponent,
    URL,
    console,
    ...extraContext
  });

  return vm.runInContext(`(${functionSource})`, context);
}

test("huggingface/search validates required query", async () => {
  const adapter = await loadAdapter("huggingface/search.js", {
    fetch: async () => {
      throw new Error("fetch should not be called");
    }
  });

  const result = await adapter({});
  assert.deepEqual(toPlain(result), { error: "Missing required argument: query" });
});

test("huggingface/search supports plural type aliases and author fallback", async () => {
  let requestedUrl = null;
  const adapter = await loadAdapter("huggingface/search.js", {
    fetch: async (url) => {
      requestedUrl = url;
      return {
        ok: true,
        async json() {
          return [{
            id: "google-bert/bert-base-uncased",
            likes: 2603,
            downloads: 71001051,
            private: false,
            gated: false,
            disabled: false,
            createdAt: "2022-03-02T23:29:04.000Z",
            tags: ["transformers", "bert"],
            pipeline_tag: "fill-mask",
            library_name: "transformers"
          }];
        }
      };
    }
  });

  const result = await adapter({ query: "bert", type: "models", count: 1 });
  assert.equal(requestedUrl, "https://huggingface.co/api/models?search=bert&limit=1");
  assert.equal(result.type, "model");
  assert.equal(result.results[0].author, "google-bert");
  assert.equal(result.results[0].url, "https://huggingface.co/google-bert/bert-base-uncased");
});

test("huggingface/search rejects unsupported type", async () => {
  const adapter = await loadAdapter("huggingface/search.js", {
    fetch: async () => {
      throw new Error("fetch should not be called");
    }
  });

  const result = await adapter({ query: "bert", type: "paper" });
  assert.equal(result.error, "Invalid type");
  assert.match(result.hint, /model, dataset, space/);
});

test("huggingface/model preserves repo path segments", async () => {
  let requestedUrl = null;
  const adapter = await loadAdapter("huggingface/model.js", {
    fetch: async (url) => {
      requestedUrl = url;
      return {
        ok: true,
        async json() {
          return {
            id: "google-bert/bert-base-uncased",
            author: "google-bert",
            pipeline_tag: "fill-mask",
            library_name: "transformers",
            downloads: 1,
            likes: 2,
            createdAt: "2022-01-01T00:00:00.000Z",
            lastModified: "2024-01-01T00:00:00.000Z",
            tags: ["transformers"],
            siblings: [{ rfilename: "README.md" }],
            cardData: {
              license: "apache-2.0",
              language: "en",
              datasets: ["wikipedia"]
            }
          };
        }
      };
    }
  });

  const result = await adapter({ id: "google-bert/bert-base-uncased" });
  assert.equal(requestedUrl, "https://huggingface.co/api/models/google-bert/bert-base-uncased");
  assert.deepEqual(toPlain(result.languages), ["en"]);
  assert.deepEqual(toPlain(result.datasets), ["wikipedia"]);
  assert.equal(result.url, "https://huggingface.co/google-bert/bert-base-uncased");
});

test("huggingface/dataset returns split counts", async () => {
  const adapter = await loadAdapter("huggingface/dataset.js", {
    fetch: async () => ({
      ok: true,
      async json() {
        return {
          id: "stanfordnlp/imdb",
          author: "stanfordnlp",
          description: "Large Movie Review Dataset",
          downloads: 100,
          likes: 10,
          createdAt: "2022-01-01T00:00:00.000Z",
          lastModified: "2024-01-01T00:00:00.000Z",
          tags: ["language:en"],
          siblings: [{}, {}],
          cardData: {
            pretty_name: "IMDB",
            language: ["en"],
            license: ["other"],
            task_categories: ["text-classification"],
            task_ids: ["sentiment-classification"],
            dataset_info: {
              splits: [
                { name: "train", num_examples: 25000 },
                { name: "test", num_examples: 25000 }
              ]
            }
          }
        };
      }
    })
  });

  const result = await adapter({ id: "stanfordnlp/imdb" });
  assert.equal(result.prettyName, "IMDB");
  assert.equal(result.license, "other");
  assert.deepEqual(toPlain(result.splits), [
    { name: "train", numExamples: 25000 },
    { name: "test", numExamples: 25000 }
  ]);
});

test("huggingface/space returns runtime fields", async () => {
  const adapter = await loadAdapter("huggingface/space.js", {
    fetch: async () => ({
      ok: true,
      async json() {
        return {
          id: "abidlabs/en2fr",
          author: "abidlabs",
          sdk: "gradio",
          likes: 5,
          createdAt: "2022-11-10T13:00:12.000Z",
          lastModified: "2026-01-27T19:48:42.000Z",
          host: "https://abidlabs-en2fr.hf.space",
          models: ["Helsinki-NLP/opus-mt-en-fr"],
          tags: ["gradio"],
          siblings: [{}, {}, {}],
          cardData: {
            title: "En2fr",
            sdk_version: "6.4.0",
            app_file: "app.py"
          },
          runtime: {
            stage: "RUNNING",
            hardware: { current: "cpu-upgrade" }
          }
        };
      }
    })
  });

  const result = await adapter({ id: "abidlabs/en2fr" });
  assert.equal(result.title, "En2fr");
  assert.equal(result.stage, "RUNNING");
  assert.equal(result.hardware, "cpu-upgrade");
  assert.equal(result.url, "https://huggingface.co/spaces/abidlabs/en2fr");
});
