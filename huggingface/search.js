/* @meta
{
  "name": "huggingface/search",
  "description": "Search Hugging Face models, datasets, or spaces",
  "domain": "huggingface.co",
  "args": {
    "query": {"type": "string", "required": true, "description": "Search query"},
    "type": {"type": "string", "required": false, "description": "Resource type: model, dataset, or space (default: model)"},
    "count": {"type": "number", "required": false, "description": "Number of results (default 10, max 50)"}
  },
  "readOnly": true,
  "example": "bb-browser site huggingface/search \"bert\" --type model"
}
*/

async function(args) {
  const query = args.query || args._text || args._input;
  if (!query) return { error: "Missing required argument: query" };

  const rawType = String(args.type || "model").toLowerCase();
  const normalizedType = rawType === "models" ? "model"
    : rawType === "datasets" ? "dataset"
    : rawType === "spaces" ? "space"
    : rawType;

  const endpointMap = {
    model: "models",
    dataset: "datasets",
    space: "spaces"
  };

  const endpoint = endpointMap[normalizedType];
  if (!endpoint) {
    return {
      error: "Invalid type",
      hint: "Use one of: model, dataset, space"
    };
  }

  const count = Math.min(Math.max(Number(args.count || 10), 1), 50);
  const url = `https://huggingface.co/api/${endpoint}?search=${encodeURIComponent(query)}&limit=${count}`;
  const resp = await fetch(url);
  if (!resp.ok) return { error: "HTTP " + resp.status };

  const data = await resp.json();
  const items = (Array.isArray(data) ? data : []).map((item) => {
    const id = item.id || item.modelId || null;
    const author = item.author || (id && id.includes("/") ? id.split("/")[0] : null);
    const base = {
      id,
      author,
      likes: item.likes ?? 0,
      downloads: item.downloads ?? null,
      private: !!item.private,
      gated: !!item.gated,
      disabled: !!item.disabled,
      createdAt: item.createdAt || null,
      updatedAt: item.lastModified || null,
      tags: Array.isArray(item.tags) ? item.tags.slice(0, 12) : []
    };

    if (normalizedType === "model") {
      return {
        ...base,
        pipelineTag: item.pipeline_tag || null,
        libraryName: item.library_name || null,
        url: id ? `https://huggingface.co/${id}` : null
      };
    }

    if (normalizedType === "dataset") {
      return {
        ...base,
        description: (item.description || "").replace(/\s+/g, " ").trim().slice(0, 300) || null,
        url: id ? `https://huggingface.co/datasets/${id}` : null
      };
    }

    return {
      ...base,
      sdk: item.sdk || null,
      host: item.host || null,
      url: id ? `https://huggingface.co/spaces/${id}` : null
    };
  });

  return {
    query,
    type: normalizedType,
    count: items.length,
    results: items
  };
}
