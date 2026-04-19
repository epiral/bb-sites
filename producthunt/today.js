/* @meta
{
  "name": "producthunt/today",
  "description": "Product Hunt 今日产品 (today's products: name, tagline, votes)",
  "domain": "www.producthunt.com",
  "args": {
    "count": {"required": false, "description": "Number of products to return (default: 20, max: 50)"}
  },
  "capabilities": ["network"],
  "readOnly": true,
  "example": "bb-browser site producthunt/today"
}
*/

async function(args) {
  const count = Math.min(parseInt(args.count) || 20, 50);

  // Strategy 1: Try frontend GraphQL API (works when browsing producthunt.com)
  try {
    const today = new Date();
    const dateStr = today.getFullYear() + '-' +
      String(today.getMonth() + 1).padStart(2, '0') + '-' +
      String(today.getDate()).padStart(2, '0');

    // Extract CSRF token from meta tag or cookie
    const csrfMeta = document.querySelector('meta[name="csrf-token"]');
    const csrfToken = csrfMeta ? csrfMeta.getAttribute('content') : '';

    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
    if (csrfToken) headers['X-CSRF-Token'] = csrfToken;

    const query = `query HomefeedQuery($date: DateTime, $cursor: String) {
      homefeed(date: $date, after: $cursor, first: 50) {
        edges {
          node {
            ... on Post {
              id
              name
              tagline
              description
              votesCount
              commentsCount
              createdAt
              featuredAt
              slug
              url
              website
              reviewsRating
              thumbnailUrl
              topics(first: 5) {
                edges {
                  node {
                    name
                    slug
                  }
                }
              }
              makers {
                name
                username
              }
            }
          }
        }
      }
    }`;

    const gqlResp = await fetch('/frontend/graphql', {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify({
        query,
        variables: { date: dateStr + 'T00:00:00Z', cursor: null }
      })
    });

    if (gqlResp.ok) {
      const gqlData = await gqlResp.json();
      const edges = gqlData?.data?.homefeed?.edges;
      if (edges && edges.length > 0) {
        const products = edges
          .map(e => e.node)
          .filter(n => n && n.name)
          .slice(0, count)
          .map((p, i) => ({
            rank: i + 1,
            id: p.id,
            name: p.name,
            tagline: p.tagline || '',
            description: (p.description || '').substring(0, 300),
            votes: p.votesCount || 0,
            comments: p.commentsCount || 0,
            url: p.url || ('https://www.producthunt.com/posts/' + p.slug),
            website: p.website || '',
            rating: p.reviewsRating || null,
            thumbnail: p.thumbnailUrl || '',
            topics: (p.topics?.edges || []).map(t => t.node?.name).filter(Boolean),
            makers: (p.makers || []).map(m => m.name || m.username).filter(Boolean),
            featured_at: p.featuredAt || p.createdAt || ''
          }));
        return { source: 'graphql', date: dateStr, count: products.length, products };
      }
    }
  } catch (e) {
    // GraphQL failed, try next strategy
  }

  // Strategy 2: Try extracting __NEXT_DATA__ from the page (SSR)
  try {
    const nextDataEl = document.querySelector('#__NEXT_DATA__');
    if (nextDataEl) {
      const nextData = JSON.parse(nextDataEl.textContent);
      // Navigate Next.js data structure to find posts
      const pageProps = nextData?.props?.pageProps;
      // Try multiple possible data paths
      const posts = pageProps?.posts || pageProps?.homefeed?.edges?.map(e => e.node) ||
        pageProps?.data?.homefeed?.edges?.map(e => e.node) || [];
      if (posts.length > 0) {
        const products = posts.slice(0, count).map((p, i) => ({
          rank: i + 1,
          id: p.id,
          name: p.name,
          tagline: p.tagline || '',
          description: (p.description || '').substring(0, 300),
          votes: p.votesCount || p.votes_count || 0,
          comments: p.commentsCount || p.comments_count || 0,
          url: p.url || ('https://www.producthunt.com/posts/' + (p.slug || '')),
          website: p.website || '',
          topics: (p.topics || []).map(t => typeof t === 'string' ? t : (t.name || t.slug || '')).filter(Boolean),
          makers: (p.makers || []).map(m => m.name || m.username || '').filter(Boolean),
          featured_at: p.featuredAt || p.featured_at || ''
        }));
        return { source: 'nextdata', count: products.length, products };
      }
    }
  } catch (e) {
    // __NEXT_DATA__ extraction failed, try next strategy
  }

  // Strategy 3: Try Apollo cache (Product Hunt uses Apollo Client)
  try {
    const apolloState = window.__APOLLO_STATE__ || window.__APOLLO_CLIENT__?.cache?.data?.data;
    if (apolloState) {
      const postKeys = Object.keys(apolloState).filter(k => k.startsWith('Post:'));
      if (postKeys.length > 0) {
        const products = postKeys
          .map(k => apolloState[k])
          .filter(p => p && p.name)
          .sort((a, b) => (b.votesCount || 0) - (a.votesCount || 0))
          .slice(0, count)
          .map((p, i) => ({
            rank: i + 1,
            id: p.id,
            name: p.name,
            tagline: p.tagline || '',
            votes: p.votesCount || 0,
            comments: p.commentsCount || 0,
            url: p.url || ('https://www.producthunt.com/posts/' + (p.slug || '')),
            website: p.website || '',
            topics: [],
            makers: []
          }));
        return { source: 'apollo_cache', count: products.length, products };
      }
    }
  } catch (e) {
    // Apollo cache extraction failed, try next strategy
  }

  // Strategy 4: Parse the DOM directly
  try {
    // Navigate to homepage if not already there
    const sections = document.querySelectorAll('[data-test="homepage-section"], [class*="styles_item"], [data-test="post-item"]');
    if (sections.length === 0) {
      // Try broader selectors for product cards
      const allLinks = document.querySelectorAll('a[href*="/posts/"]');
      const seen = new Set();
      const products = [];
      for (const link of allLinks) {
        const href = link.getAttribute('href');
        if (!href || seen.has(href)) continue;
        seen.add(href);
        // Find the closest parent card element
        const card = link.closest('[class*="item"], [class*="post"], li, article') || link.parentElement;
        if (!card) continue;
        const name = card.querySelector('h3, [class*="title"], [class*="name"]')?.textContent?.trim() ||
          link.textContent?.trim() || '';
        if (!name || name.length > 100) continue;
        const tagline = card.querySelector('[class*="tagline"], [class*="description"], p')?.textContent?.trim() || '';
        // Try to find vote count
        const voteEl = card.querySelector('[class*="vote"], [class*="count"], button');
        const voteText = voteEl?.textContent?.trim() || '';
        const votes = parseInt(voteText.replace(/[^\d]/g, '')) || 0;

        products.push({
          rank: products.length + 1,
          name,
          tagline: tagline.substring(0, 200),
          votes,
          url: href.startsWith('http') ? href : 'https://www.producthunt.com' + href,
          topics: [],
          makers: []
        });
        if (products.length >= count) break;
      }
      if (products.length > 0) {
        return { source: 'dom_parse', count: products.length, products };
      }
    } else {
      const products = [];
      for (const section of sections) {
        const name = section.querySelector('h3, [class*="title"]')?.textContent?.trim() || '';
        const tagline = section.querySelector('[class*="tagline"], p')?.textContent?.trim() || '';
        const voteEl = section.querySelector('[class*="vote"], button');
        const votes = parseInt((voteEl?.textContent || '').replace(/[^\d]/g, '')) || 0;
        const link = section.querySelector('a[href*="/posts/"]');
        const href = link?.getAttribute('href') || '';
        if (!name) continue;
        products.push({
          rank: products.length + 1,
          name,
          tagline: tagline.substring(0, 200),
          votes,
          url: href.startsWith('http') ? href : 'https://www.producthunt.com' + href,
          topics: [],
          makers: []
        });
        if (products.length >= count) break;
      }
      if (products.length > 0) {
        return { source: 'dom_parse', count: products.length, products };
      }
    }
  } catch (e) {
    // DOM parsing failed
  }

  // Strategy 5: Fallback to Atom feed (no vote counts, but always works)
  try {
    const feedResp = await fetch('https://www.producthunt.com/feed', {credentials: 'include'});
    if (feedResp.ok) {
      const feedText = await feedResp.text();
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(feedText, 'application/xml');
      const entries = xmlDoc.querySelectorAll('entry');
      const products = [];
      for (const entry of entries) {
        const title = entry.querySelector('title')?.textContent?.trim() || '';
        const content = entry.querySelector('content')?.textContent?.trim() || '';
        const link = entry.querySelector('link[rel="alternate"]')?.getAttribute('href') || '';
        const author = entry.querySelector('author name')?.textContent?.trim() || '';
        const published = entry.querySelector('published')?.textContent?.trim() || '';
        const id = entry.querySelector('id')?.textContent?.trim() || '';
        const postId = id.match(/Post\/(\d+)/)?.[1] || '';
        if (!title) continue;
        // Strip HTML tags from content
        const tagline = content.replace(/<[^>]*>/g, '').trim();
        products.push({
          rank: products.length + 1,
          id: postId,
          name: title,
          tagline: tagline.substring(0, 200),
          author,
          url: link,
          published,
          votes: null,
          topics: [],
          makers: [author].filter(Boolean)
        });
        if (products.length >= count) break;
      }
      if (products.length > 0) {
        return {
          source: 'atom_feed',
          note: 'Vote counts unavailable via feed. Open producthunt.com first for richer data.',
          count: products.length,
          products
        };
      }
    }
  } catch (e) {
    // Feed also failed
  }

  return {
    error: 'Could not fetch Product Hunt data',
    hint: 'Open https://www.producthunt.com in bb-browser first, then retry. The adapter needs browser context with cookies.'
  };
}
