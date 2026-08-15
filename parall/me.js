/* @meta
{
  "name": "parall/me",
  "description": "读取当前 Parall session 的用户摘要",
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
  const result = await parallGet('/users/me');
  if (!result.ok) return result.result;
  const body = result.body || {};
  const user = {};
  for (const key of ['id', 'display_name', 'type', 'status', 'created_at', 'updated_at', 'avatar_url']) {
    if (body[key] !== undefined) user[key] = body[key];
  }
  const data = {user, observed_at: new Date().toISOString()};
  return parallCarrier(data, {
    effective_args: {},
    completeness: Object.keys(user).length > 0 ? 'complete' : 'partial',
    reason: Object.keys(user).length > 0 ? 'current_user' : 'partial_parse',
    source: {url: parallSafeSource('/users/me')},
    pagination: {supported: false, returned: 1},
    auth: parallAuth(),
    warnings: parallWarnings()
  });
};
