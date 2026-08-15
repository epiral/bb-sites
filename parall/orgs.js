/* @meta
{
  "name": "parall/orgs",
  "description": "列出当前 Parall session 可见的组织",
  "domain": "app.parall.com",
  "auth": "required",
  "profile": "required",
  "side_effect": "read_only",
  "retry_safety": "safe_with_backoff",
  "max_concurrency": 1,
  "serialization_key": "site:parall:{profile}",
  "output_modes": ["legacy", "envelope_v1"],
  "timeout_class": "standard",
  "envelope_versions": ["pinix.site-result-envelope.v1"],
  "readOnly": true
}
*/

module.exports = async function() {
  const result = await parallGet('/orgs');
  if (!result.ok) return result.result;
  const data = Array.isArray(result.body?.data) ? result.body.data : [];
  const orgs = data.map((org) => {
    const item = {};
    for (const key of ['id', 'name', 'is_personal', 'role', 'timezone', 'created_at']) {
      if (org[key] !== undefined) item[key] = org[key];
    }
    return item;
  });
  return parallCarrier({count: orgs.length, orgs, observed_at: new Date().toISOString()}, {
    effective_args: {},
    completeness: orgs.length ? 'complete' : 'empty',
    reason: orgs.length ? 'complete' : 'no_results',
    source: {url: parallSafeSource('/orgs')},
    pagination: {supported: false, returned: orgs.length},
    auth: parallAuth(),
    warnings: parallWarnings()
  });
};
