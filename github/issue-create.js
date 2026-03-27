/* @meta
{
  "name": "github/issue-create",
  "description": "Create a GitHub issue",
  "domain": "github.com",
  "args": {
    "repo": {"required": true, "description": "owner/repo format"},
    "title": {"required": true, "description": "Issue title"},
    "body": {"required": false, "description": "Issue body (markdown)"}
  },
  "capabilities": ["network"],
  "readOnly": false,
  "example": "bb-browser site github/issue-create epiral/bb-sites --title \"[reddit/me] returns empty\" --body \"Description here\""
}
*/

async function(args) {
  if (!args.repo) return {error: 'Missing argument: repo'};
  if (!args.title) return {error: 'Missing argument: title'};

  const resp = await new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('POST', 'https://api.github.com/repos/' + args.repo + '/issues');
    x.setRequestHeader('Accept', 'application/vnd.github+json');
    x.setRequestHeader('Content-Type', 'application/json');
    x.onload = () => resolve({status: x.status, text: x.responseText});
    x.onerror = () => reject(new Error('Failed to fetch'));
    x.send(JSON.stringify({title: args.title, body: args.body || ''}));
  });

  if (resp.status < 200 || resp.status >= 300) {
    const status = resp.status;
    if (status === 401 || status === 403) return {error: 'HTTP ' + status, hint: 'Not logged in to GitHub'};
    if (status === 404) return {error: 'Repo not found: ' + args.repo};
    return {error: 'HTTP ' + status};
  }

  const issue = JSON.parse(resp.text);
  return {
    number: issue.number,
    title: issue.title,
    url: issue.html_url,
    state: issue.state
  };
}
