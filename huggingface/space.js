/* @meta
{
  "name": "huggingface/space",
  "description": "Get Hugging Face Space details",
  "domain": "huggingface.co",
  "args": {
    "id": {"type": "string", "required": true, "description": "Space id, e.g. abidlabs/en2fr"}
  },
  "readOnly": true,
  "example": "bb-browser site huggingface/space \"abidlabs/en2fr\""
}
*/

async function(args) {
  const id = args.id || args._text || args._input;
  if (!id) return { error: "Missing required argument: id" };

  const pathId = String(id).split("/").map((part) => encodeURIComponent(part)).join("/");
  const resp = await fetch(`https://huggingface.co/api/spaces/${pathId}`);
  if (!resp.ok) return { error: "HTTP " + resp.status };

  const data = await resp.json();
  const cardData = data.cardData || {};
  const runtime = data.runtime || {};

  return {
    id: data.id || id,
    author: data.author || null,
    title: cardData.title || null,
    sdk: data.sdk || cardData.sdk || null,
    sdkVersion: cardData.sdk_version || null,
    appFile: cardData.app_file || null,
    likes: data.likes ?? 0,
    private: !!data.private,
    gated: !!data.gated,
    disabled: !!data.disabled,
    createdAt: data.createdAt || null,
    updatedAt: data.lastModified || null,
    stage: runtime.stage || null,
    hardware: runtime.hardware?.current || null,
    host: data.host || null,
    models: Array.isArray(data.models) ? data.models.slice(0, 20) : [],
    tags: Array.isArray(data.tags) ? data.tags.slice(0, 20) : [],
    files: Array.isArray(data.siblings) ? data.siblings.length : 0,
    url: `https://huggingface.co/spaces/${data.id || id}`
  };
}
