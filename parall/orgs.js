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
  return parallReadList({path: '/orgs', itemsKey: 'orgs', args: {}});
};
