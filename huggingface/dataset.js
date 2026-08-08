/* @meta
{
  "name": "huggingface/dataset",
  "description": "Get Hugging Face dataset details",
  "domain": "huggingface.co",
  "args": {
    "id": {"type": "string", "required": true, "description": "Dataset id, e.g. stanfordnlp/imdb"}
  },
  "readOnly": true,
  "example": "bb-browser site huggingface/dataset \"stanfordnlp/imdb\""
}
*/

async function(args) {
  const id = args.id || args._text || args._input;
  if (!id) return { error: "Missing required argument: id" };

  const pathId = String(id).split("/").map((part) => encodeURIComponent(part)).join("/");
  const resp = await fetch(`https://huggingface.co/api/datasets/${pathId}`);
  if (!resp.ok) return { error: "HTTP " + resp.status };

  const data = await resp.json();
  const cardData = data.cardData || {};
  const datasetInfo = cardData.dataset_info || {};

  return {
    id: data.id || id,
    author: data.author || null,
    prettyName: cardData.pretty_name || null,
    description: (data.description || "").replace(/\s+/g, " ").trim().slice(0, 600) || null,
    downloads: data.downloads ?? null,
    likes: data.likes ?? 0,
    private: !!data.private,
    gated: !!data.gated,
    disabled: !!data.disabled,
    createdAt: data.createdAt || null,
    updatedAt: data.lastModified || null,
    languages: Array.isArray(cardData.language) ? cardData.language : [],
    license: Array.isArray(cardData.license) ? cardData.license[0] : cardData.license || null,
    taskCategories: Array.isArray(cardData.task_categories) ? cardData.task_categories : [],
    taskIds: Array.isArray(cardData.task_ids) ? cardData.task_ids : [],
    splits: Array.isArray(datasetInfo.splits) ? datasetInfo.splits.map((split) => ({
      name: split.name,
      numExamples: split.num_examples ?? null
    })) : [],
    tags: Array.isArray(data.tags) ? data.tags.slice(0, 20) : [],
    files: Array.isArray(data.siblings) ? data.siblings.length : 0,
    url: `https://huggingface.co/datasets/${data.id || id}`
  };
}
