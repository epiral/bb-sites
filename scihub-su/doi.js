/* @meta
{
  "name": "scihub-su/doi",
  "description": "通过 DOI 在 Sci-Hub.su 获取学术论文 PDF (Download paper by DOI from sci-hub.su)",
  "domain": "sci-hub.su",
  "args": {
    "doi": {"required": true, "description": "Paper DOI (e.g., 10.1126/science.aaa8415)"}
  },
  "readOnly": true,
  "example": "bb-browser site scihub-su/doi 10.1016/j.watres.2023.120123"
}
*/

async function(args) {
  if (!args.doi) return {error: 'Missing argument: doi', hint: 'Provide a DOI string'};

  // Domain check
  if (!location.hostname.includes('sci-hub.su')) {
    return {error: 'Not on sci-hub.su domain', hint: 'Open a sci-hub.su tab first: bb-browser open https://sci-hub.su --tab'};
  }

  const doi = args.doi.trim();
  // Sci-Hub accepts DOI directly in the path
  const url = '/' + encodeURIComponent(doi);

  let html = '';
  try {
    const resp = await fetch(url, {
      credentials: 'include',
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Referer': location.href
      }
    });
    if (!resp.ok) return {error: 'HTTP ' + resp.status, hint: 'Sci-Hub service may be unavailable or paper not found'};
    html = await resp.text();
  } catch (e) {
    return {error: 'Failed to fetch: ' + e.message, hint: 'Make sure a sci-hub.su tab is open'};
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // Check for error indicators
  const titleEl = doc.querySelector('title');
  const titleText = titleEl ? titleEl.textContent : '';
  if (titleText.includes('404') || titleText.includes('Not Found') || titleText.includes('error')) {
    return {error: 'Paper not found for DOI: ' + doi, hint: 'The paper may not be in Sci-Hub database, or the DOI is incorrect'};
  }

  // Check for verification/captcha page
  if (html.includes('Checking your browser') || html.includes('DDoS-Guard') || html.includes('captcha')) {
    return {error: 'Security verification required', hint: 'Please complete the browser verification on the sci-hub.su tab first'};
  }

  // Extract PDF link - try multiple strategies
  let pdfUrl = '';
  let paperTitle = '';

  // Strategy 1: Look for embed or iframe with PDF
  const embed = doc.querySelector('embed[src]');
  const iframe = doc.querySelector('iframe[src]');
  if (embed) {
    pdfUrl = embed.getAttribute('src');
  } else if (iframe) {
    pdfUrl = iframe.getAttribute('src');
  }

  // Strategy 2: Look for direct PDF links
  if (!pdfUrl) {
    const links = doc.querySelectorAll('a[href]');
    for (const a of links) {
      const href = a.getAttribute('href');
      if (href && (href.endsWith('.pdf') || href.includes('.pdf?'))) {
        pdfUrl = href;
        break;
      }
    }
  }

  // Strategy 3: Look for button or div with onclick containing pdf
  if (!pdfUrl) {
    const onclickEls = doc.querySelectorAll('[onclick*="pdf"], [onclick*="download"]');
    for (const el of onclickEls) {
      const onclick = el.getAttribute('onclick') || '';
      const match = onclick.match(/['"]([^'"]*\.pdf[^'"]*)['"]/);
      if (match) {
        pdfUrl = match[1];
        break;
      }
    }
  }

  // Strategy 4: Look for any element with data-pdf or similar attributes
  if (!pdfUrl) {
    const dataPdf = doc.querySelector('[data-pdf], [data-url], [data-file]');
    if (dataPdf) {
      pdfUrl = dataPdf.getAttribute('data-pdf') || dataPdf.getAttribute('data-url') || dataPdf.getAttribute('data-file');
    }
  }

  // Strategy 5: Look for location.replace or redirect in script tags
  if (!pdfUrl) {
    const scripts = doc.querySelectorAll('script');
    for (const script of scripts) {
      const text = script.textContent || '';
      const match = text.match(/location\.\w+\s*[=]\s*['"]([^'"]*\.pdf[^'"]*)['"]/);
      if (match) {
        pdfUrl = match[1];
        break;
      }
    }
  }

  // Resolve relative URLs
  if (pdfUrl && !pdfUrl.startsWith('http')) {
    if (pdfUrl.startsWith('//')) {
      pdfUrl = 'https:' + pdfUrl;
    } else if (pdfUrl.startsWith('/')) {
      pdfUrl = 'https://sci-hub.su' + pdfUrl;
    } else {
      pdfUrl = 'https://sci-hub.su/' + pdfUrl;
    }
  }

  // Extract paper title if available
  const heading = doc.querySelector('h1, h2, #title, .title, [class*="title"]');
  if (heading) {
    paperTitle = heading.textContent.trim();
  }

  // Extract author info if available
  let authors = '';
  const authorEl = doc.querySelector('.author, #author, [class*="author"]');
  if (authorEl) {
    authors = authorEl.textContent.trim();
  }

  if (!pdfUrl) {
    return {
      error: 'Could not extract PDF link from Sci-Hub response',
      hint: 'The paper may not be available, or the page structure has changed. Try opening the DOI directly in browser: https://sci-hub.su/' + doi,
      doi: doi,
      title: paperTitle || undefined,
      htmlPreview: html.substring(0, 500)
    };
  }

  return {
    doi: doi,
    title: paperTitle || undefined,
    authors: authors || undefined,
    pdfUrl: pdfUrl,
    note: 'Sci-Hub.su PDF link extracted. Open the URL to download the paper.',
    warning: 'This mirror may not be an official Sci-Hub domain. Use at your own risk.'
  };
}
