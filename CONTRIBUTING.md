# Contributing to bb-sites

## Writing an Adapter

Each adapter is a single `.js` file in `<platform>/command.js`.

### Structure

```javascript
/* @meta
{
  "name": "platform/command",
  "description": "What it does",
  "domain": "example.com",
  "args": {
    "query": {"required": true, "description": "Search query"}
  },
  "readOnly": true,
  "example": "bb-browser site platform/command \"test\""
}
*/
async function(args) {
  // Your code runs in the browser page context
  // document, window, fetch with cookies — all available
}
```

`domain` is the exact HTTPS execution and `fetch()` origin. Keep requests on
that origin. If the domain root redirects elsewhere, add a same-origin
`"startPath": "/stable/path"` to establish the browser context.

### Tier Guide

| Tier | Auth | Example | Time |
|------|------|---------|------|
| 1 | Cookie only | Reddit, GitHub, V2EX | ~1 min |
| 2 | Bearer + CSRF | Twitter/X | ~3 min |
| 3 | Webpack/internal | XHS, Douyin | ~10 min |

## Resilient Patterns

Websites change frequently. Use these patterns to make adapters survive updates.

### Pattern 1: Structural DOM Extraction (not CSS classes)

CSS class names change often. Use semantic HTML elements instead.

```javascript
// ❌ Fragile: depends on CSS class
const items = doc.querySelectorAll('div.g');

// ✅ Resilient: semantic elements
const h3s = doc.querySelectorAll('h3');
for (const h3 of h3s) {
  const a = h3.closest('a');
  if (!a) continue;
  const link = a.getAttribute('href');
  if (!link || !link.startsWith('http')) continue;
  const title = h3.textContent.trim();

  // Walk up to find result container
  let container = a;
  while (container.parentElement && container.parentElement.tagName !== 'BODY') {
    const sibs = [...container.parentElement.children];
    if (sibs.filter(s => s.querySelector('h3')).length > 1) break;
    container = container.parentElement;
  }

  // Find snippet outside the link block
  const linkBlock = a.closest('div') || a;
  let snippet = '';
  for (const sp of container.querySelectorAll('span')) {
    if (linkBlock.contains(sp)) continue;
    const t = sp.textContent.trim();
    if (t.length > 30 && t !== title) { snippet = t; break; }
  }
  results.push({ title, url: link, snippet });
}
```

### Pattern 2: Dynamic Webpack Module Discovery (not hardcoded IDs)

SPA sites (Twitter/X, XHS, Douyin) bundle code with webpack. Module IDs change on every deploy.

```javascript
// Step 1: Get webpack require function
let __webpack_require__;
const chunkId = '__bb_' + Date.now();
window.webpackChunk_twitter_responsive_web.push(
  [[chunkId], {}, (req) => { __webpack_require__ = req; }]
);

// Step 2: Find module by source code signature (NOT by ID)
let targetFn;
for (const id of Object.keys(__webpack_require__.m)) {
  const src = __webpack_require__.m[id].toString();
  if (src.includes('some.stable.string') && src.includes('exportName:')) {
    targetFn = __webpack_require__(id).exportName;
    break;
  }
}

// Step 3: Find GraphQL queryId by operationName
let queryId;
for (const id of Object.keys(__webpack_require__.m)) {
  const src = __webpack_require__.m[id].toString();
  const m = src.match(/queryId:"([^"]+)",operationName:"SearchTimeline"/);
  if (m) { queryId = m[1]; break; }
}
```

**Choosing signatures:**
- Use **business strings** (domain names, API paths) not variable names
- Combine **multiple features** (`includes('A') && includes('B')`)
- For GraphQL: `operationName` is stable, `queryId` changes → use former to find latter

### Pattern 3: Error Handling

```javascript
// Always validate args first
if (!args.query) return {error: 'Missing argument: query'};

// Check auth
const csrf = document.cookie.match(/ct0=([^;]+)/)?.[1];
if (!csrf) return {error: 'No CSRF token', hint: 'Please log in to x.com first.'};

// Check dynamic discovery
if (!queryId) return {
  error: 'Cannot find queryId for SearchTimeline',
  hint: 'Twitter GraphQL schema may have changed.'
};

// HTTP errors
if (!resp.ok) return {error: 'HTTP ' + resp.status, hint: 'API may have changed'};
```

Keywords `401`, `403`, `unauthorized`, `login`, `sign in` in error/hint trigger automatic login prompts.

## Testing

```bash
# Save to local dir
mkdir -p ~/.bb-browser/sites/myplatform
cp myplatform/command.js ~/.bb-browser/sites/myplatform/

# Test
bb-browser site myplatform/command "test" --json
```

## Submitting

1. Fork this repo
2. Add your adapter file
3. Open a PR with title: `feat(platform): add command-name adapter`
