/* @meta
{
  "name": "boss/detail",
  "description": "获取 BOSS直聘职位详情（JD、公司信息）",
  "domain": "www.zhipin.com",
  "args": {
    "securityId": {"required": true, "description": "Job securityId (from boss/search results)"}
  },
  "readOnly": true,
  "example": "bb-browser site boss/detail <securityId>"
}
*/

async function(args) {
  if (!args.securityId) return {error: 'Missing argument: securityId', hint: 'Run boss/search first to get securityId'};
  const resp = await fetch('/wapi/zpgeek/job/detail.json?securityId=' + encodeURIComponent(args.securityId), {credentials: 'include'});
  if (!resp.ok) return {error: 'HTTP ' + resp.status};
  const d = await resp.json();
  if (d.code !== 0) return {error: d.message || 'API error', code: d.code};
  const job = d.zpData?.jobInfo || {};
  const brand = d.zpData?.brandComInfo || {};
  const boss = d.zpData?.bossInfo || {};
  return {
    job: {
      name: job.jobName, salary: job.salaryDesc, experience: job.experienceName,
      degree: job.degreeName, location: job.locationName, address: job.address,
      skills: job.showSkills, description: job.postDescription, status: job.jobStatusDesc,
      url: job.encryptId ? `https://www.zhipin.com/job_detail/${job.encryptId}.html` : undefined
    },
    company: {
      name: brand.brandName, stage: brand.stageName, scale: brand.scaleName,
      industry: brand.industryName, intro: brand.introduce
    },
    boss: {
      name: boss.name, title: boss.title
    }
  };
}
