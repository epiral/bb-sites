/* @meta
{
  "name": "boss/search",
  "description": "BOSS直聘搜索职位",
  "domain": "www.zhipin.com",
  "args": {
    "query": {"required": true, "description": "Search keyword (e.g. AI agent, 前端)"},
    "city": {"required": false, "description": "City code (default 101010100=北京, 101020100=上海, 101280100=广州, 101210100=杭州, 101280600=深圳)"},
    "page": {"required": false, "description": "Page number (default 1)"},
    "experience": {"required": false, "description": "Experience filter (e.g. 101=在校, 102=应届, 103=1年以内, 104=1-3年, 105=3-5年, 106=5-10年, 107=10年以上)"},
    "degree": {"required": false, "description": "Degree filter (e.g. 209=高中, 208=大专, 206=本科, 203=硕士, 201=博士)"}
  },
  "readOnly": true,
  "example": "bb-browser site boss/search \"AI agent\""
}
*/

async function(args) {
  if (!args.query) return {error: 'Missing argument: query', hint: 'Provide a job search keyword'};
  const city = args.city || '101010100';
  const page = parseInt(args.page) || 1;
  const params = new URLSearchParams({
    scene: '1', query: args.query, city, page: String(page), pageSize: '15',
    experience: args.experience || '', degree: args.degree || '',
    payType: '', partTime: '', industry: '', scale: '', stage: '',
    position: '', jobType: '', salary: '', multiBusinessDistrict: '', multiSubway: ''
  });
  const resp = await fetch('/wapi/zpgeek/search/joblist.json?' + params.toString(), {credentials: 'include'});
  if (!resp.ok) return {error: 'HTTP ' + resp.status};
  const d = await resp.json();
  if (d.code !== 0) return {error: d.message || 'API error', code: d.code};
  const zpData = d.zpData || {};
  const jobs = (zpData.jobList || []).map(j => ({
    name: j.jobName, salary: j.salaryDesc, company: j.brandName,
    city: j.cityName, area: j.areaDistrict, district: j.businessDistrict,
    experience: j.jobExperience, degree: j.jobDegree,
    skills: j.skills, welfare: j.welfareList,
    boss: j.bossName, bossTitle: j.bossTitle, bossOnline: j.bossOnline,
    industry: j.brandIndustry, scale: j.brandScaleName, stage: j.brandStageName,
    jobId: j.encryptJobId, securityId: j.securityId,
    url: j.encryptJobId ? `https://www.zhipin.com/job_detail/${j.encryptJobId}.html` : undefined
  }));
  return {query: args.query, city, page, total: zpData.totalCount, count: jobs.length, jobs};
}
