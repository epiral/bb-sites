/* @meta
{
  "name": "cvrest/templates",
  "description": "Get available resume templates from CVRest",
  "domain": "cvrest.com",
  "args": {
    "lang": {"required": false, "description": "Language code (en, ch, ar, fr, de, es, ru, it, pt, ja), default: en"}
  },
  "capabilities": ["network"],
  "readOnly": true,
  "example": "bb-browser site cvrest/templates ch"
}
*/

async function(args) {
  const lang = args.lang || 'en';
  const baseUrl = `https://cvrest.com/${lang === 'en' ? '' : lang + '/'}`;
  const url = baseUrl + 'resume-templates';
  
  const resp = await fetch(url);
  if (!resp.ok) return {error: 'HTTP ' + resp.status};
  
  const html = await resp.text();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  
  const templates = Array.from(doc.querySelectorAll('img'))
    .map(img => ({
      src: img.src,
      alt: img.alt || ''
    }))
    .filter(img => img.src && (img.src.includes('resume-t') || img.src.includes('cv-t')))
    .map(img => {
      const src = img.src;
      // Example src: "https://media.cvrest.com/cvrest-media/image/resume-t1-en-0.png/w/600"
      const idMatch = src.match(/-(t\d+)-/);
      const typeMatch = src.match(/(resume|cv)-t/);
      
      return {
        id: idMatch ? idMatch[1] : 'unknown',
        type: typeMatch ? typeMatch[1] : 'template',
        preview: src,
        alt: img.alt
      };
    });

  // Unique by ID
  const seen = new Set();
  const result = [];
  for (const t of templates) {
    if (!seen.has(t.id)) {
      seen.add(t.id);
      result.push(t);
    }
  }

  return {
    lang,
    url,
    count: result.length,
    templates: result
  };
}
