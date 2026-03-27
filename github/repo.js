/* @meta
{
  "name": "github/repo",
  "description": "获取 GitHub 仓库信息",
  "domain": "github.com",
  "args": {
    "repo": {"required": true, "description": "owner/repo format (e.g. epiral/bb-browser)"}
  },
  "capabilities": ["network"],
  "readOnly": true,
  "example": "bb-browser site github/repo epiral/bb-browser"
}
*/

async function(args) {
  if (!args.repo) return {error: 'Missing argument: repo', hint: 'Use owner/repo format'};
  const resp = await new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('GET', 'https://api.github.com/repos/' + args.repo);
    x.setRequestHeader('Accept', 'application/vnd.github+json');
    x.onload = () => resolve({status: x.status, text: x.responseText});
    x.onerror = () => reject(new Error('Failed to fetch'));
    x.send();
  });
  if (resp.status < 200 || resp.status >= 300) return {error: 'HTTP ' + resp.status, hint: resp.status === 404 ? 'Repo not found: ' + args.repo : 'API error'};
  const d = JSON.parse(resp.text);
  return {
    full_name: d.full_name, description: d.description, language: d.language,
    url: d.html_url || ('https://github.com/' + d.full_name),
    stars: d.stargazers_count, forks: d.forks_count, open_issues: d.open_issues_count,
    created_at: d.created_at, updated_at: d.updated_at, default_branch: d.default_branch,
    topics: d.topics, license: d.license?.spdx_id
  };
}
