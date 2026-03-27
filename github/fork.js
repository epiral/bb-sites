/* @meta
{
  "name": "github/fork",
  "description": "Fork a GitHub repository",
  "domain": "github.com",
  "args": {
    "repo": {"required": true, "description": "Repository to fork (owner/repo)"}
  },
  "capabilities": ["network"],
  "readOnly": false,
  "example": "bb-browser site github/fork epiral/bb-sites"
}
*/

async function(args) {
  if (!args.repo) return {error: 'Missing argument: repo'};

  const resp = await new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('POST', 'https://api.github.com/repos/' + args.repo + '/forks');
    x.setRequestHeader('Accept', 'application/vnd.github+json');
    x.setRequestHeader('Content-Type', 'application/json');
    x.onload = () => resolve({status: x.status, text: x.responseText});
    x.onerror = () => reject(new Error('Failed to fetch'));
    x.send('{}');
  });

  if (resp.status < 200 || resp.status >= 300) {
    const status = resp.status;
    if (status === 401 || status === 403) return {error: 'HTTP ' + status, hint: 'Not logged in to GitHub'};
    if (status === 404) return {error: 'Repo not found: ' + args.repo};
    return {error: 'HTTP ' + status};
  }

  const fork = JSON.parse(resp.text);
  return {
    full_name: fork.full_name,
    url: fork.html_url,
    clone_url: fork.clone_url
  };
}
