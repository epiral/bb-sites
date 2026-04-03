/* @meta
{
  "name": "github/pr-create",
  "description": "Create a GitHub pull request",
  "domain": "github.com",
  "args": {
    "repo": {"required": true, "description": "Target repo (owner/repo)"},
    "title": {"required": true, "description": "PR title"},
    "head": {"required": true, "description": "Source branch (user:branch or branch)"},
    "base": {"required": false, "description": "Target branch (default: main)"},
    "body": {"required": false, "description": "PR description (markdown)"}
  },
  "capabilities": ["network"],
  "readOnly": false,
  "example": "bb-browser site github/pr-create epiral/bb-sites --title \"feat(weibo): add hot adapter\" --head myuser:feat-weibo --body \"Adds weibo/hot.js\""
}
*/

async function(args) {
  if (!args.repo) return {error: 'Missing argument: repo'};
  if (!args.title) return {error: 'Missing argument: title'};
  if (!args.head) return {error: 'Missing argument: head', hint: 'Provide source branch as "user:branch" or "branch"'};

  const resp = await new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('POST', 'https://api.github.com/repos/' + args.repo + '/pulls');
    x.setRequestHeader('Accept', 'application/vnd.github+json');
    x.setRequestHeader('Content-Type', 'application/json');
    x.onload = () => resolve({status: x.status, text: x.responseText});
    x.onerror = () => reject(new Error('Failed to fetch'));
    x.send(JSON.stringify({
      title: args.title,
      head: args.head,
      base: args.base || 'main',
      body: args.body || ''
    }));
  });

  if (resp.status < 200 || resp.status >= 300) {
    const status = resp.status;
    if (status === 401 || status === 403) return {error: 'HTTP ' + status, hint: 'Not logged in to GitHub'};
    if (status === 404) return {error: 'Repo not found: ' + args.repo};
    if (status === 422) {
      const d = JSON.parse(resp.text || 'null');
      const msg = d?.errors?.[0]?.message || d?.message || 'Validation failed';
      return {error: msg, hint: 'Check that the head branch exists and has commits ahead of base'};
    }
    return {error: 'HTTP ' + status};
  }

  const pr = JSON.parse(resp.text);
  return {
    number: pr.number,
    title: pr.title,
    url: pr.html_url,
    state: pr.state
  };
}
