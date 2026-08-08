/* @meta
{
  "name": "huggingface/model",
  "description": "Get Hugging Face model details",
  "domain": "huggingface.co",
  "args": {
    "id": {"type": "string", "required": true, "description": "Model id, e.g. google-bert/bert-base-uncased"}
  },
  "readOnly": true,
  "example": "bb-browser site huggingface/model \"google-bert/bert-base-uncased\""
}
*/

async function(args) {
  const id = args.id || args._text || args._input;
  if (!id) return { error: "Missing required argument: id" };

  const pathId = String(id).split("/").map((part) => encodeURIComponent(part)).join("/");
  const resp = await fetch(`https://huggingface.co/api/models/${pathId}`);
  if (!resp.ok) return { error: "HTTP " + resp.status };

  const data = await resp.json();
  const cardData = data.cardData || {};

  return {
    id: data.id || data.modelId || id,
    author: data.author || null,
    description: (cardData.description || "").replace(/\s+/g, " ").trim().slice(0, 500) || null,
    pipelineTag: data.pipeline_tag || null,
    libraryName: data.library_name || null,
    downloads: data.downloads ?? null,
    likes: data.likes ?? 0,
    private: !!data.private,
    gated: !!data.gated,
    disabled: !!data.disabled,
    inference: data.inference || null,
    createdAt: data.createdAt || null,
    updatedAt: data.lastModified || null,
    license: cardData.license || null,
    languages: Array.isArray(cardData.language) ? cardData.language : cardData.language ? [cardData.language] : [],
    datasets: Array.isArray(cardData.datasets) ? cardData.datasets : [],
    tags: Array.isArray(data.tags) ? data.tags.slice(0, 20) : [],
    files: Array.isArray(data.siblings) ? data.siblings.length : 0,
    url: `https://huggingface.co/${data.id || id}`
  };
}
