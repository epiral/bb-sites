/* @meta
{
  "name": "investing/earnings",
  "description": "Get upcoming earnings calendar with EPS/revenue forecasts for specified date range",
  "domain": "www.investing.com",
  "args": {
    "from": {"required": false, "description": "Start date YYYY-MM-DD (default: today)"},
    "to": {"required": false, "description": "End date YYYY-MM-DD (default: same as from, i.e. single day)"},
    "country": {"required": false, "description": "Comma-separated country filter: us,china,hk,japan,uk,germany,france,india,brazil,canada,australia (default: all)"}
  },
  "capabilities": ["network"],
  "readOnly": true,
  "example": "bb-browser site investing/earnings --from 2026-06-01 --to 2026-06-06 --country us,china,hk"
}
*/

async function(args) {
  var today = new Date().toISOString().slice(0, 10);
  var from = args.from || today;
  var to = args.to || from;

  // Country name -> investing.com country IDs
  var countryMap = {
    us: '5', usa: '5', 'united states': '5',
    china: '35', cn: '35',
    hk: '72', 'hong kong': '72',
    japan: '36', jp: '36',
    uk: '4', gb: '4', 'united kingdom': '4',
    germany: '17', de: '17',
    france: '22', fr: '22',
    india: '14', 'in': '14',
    brazil: '32', br: '32',
    canada: '6', ca: '6',
    australia: '25', au: '25',
    korea: '11', kr: '11', 'south korea': '11',
    singapore: '36', sg: '36',
    taiwan: '46', tw: '46',
    switzerland: '42', ch: '42',
    netherlands: '21', nl: '21',
    spain: '26', es: '26',
    italy: '10', it: '10',
    sweden: '9', se: '9',
    norway: '60', no: '60'
  };

  var countryIds = [];
  if (args.country) {
    var parts = args.country.split(',');
    for (var i = 0; i < parts.length; i++) {
      var key = parts[i].trim().toLowerCase();
      if (countryMap[key]) countryIds.push(countryMap[key]);
    }
  }

  var allResults = [];
  var limitFrom = 0;
  var maxPages = 10;

  for (var page = 0; page < maxPages; page++) {
    var formData = new URLSearchParams();
    formData.append('dateFrom', from);
    formData.append('dateTo', to);
    formData.append('limit_from', String(limitFrom));
    for (var c = 0; c < countryIds.length; c++) {
      formData.append('country[]', countryIds[c]);
    }
    if (page > 0 && allResults.length > 0) {
      formData.append('last_time_scope', String(allResults._lastTimeScope || ''));
    }

    var resp = await fetch('https://www.investing.com/earnings-calendar/Service/getCalendarFilteredData', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: formData.toString(),
      credentials: 'include'
    });
    if (!resp.ok) return {error: 'HTTP ' + resp.status};
    var data = await resp.json();

    // Parse HTML table rows
    var parser = new DOMParser();
    var doc = parser.parseFromString('<table>' + data.data + '</table>', 'text/html');
    var rows = doc.querySelectorAll('tr');

    var currentDate = '';
    for (var r = 0; r < rows.length; r++) {
      var row = rows[r];

      // Date divider
      if (row.hasAttribute('tablesorterdivider')) {
        var dayCell = row.querySelector('.theDay');
        if (dayCell) currentDate = dayCell.textContent.trim();
        continue;
      }

      var companyCell = row.querySelector('.earnCalCompanyName');
      if (!companyCell) continue;

      var tds = row.querySelectorAll('td');
      var flag = row.querySelector('.ceFlags');
      var link = row.querySelector('a.bold');
      var pairEl = row.querySelector('[_p_pid]');
      var timeSpan = tds.length >= 8 ? tds[7].querySelector('span') : null;

      var entry = {
        date: currentDate,
        country: flag ? flag.getAttribute('title') : '',
        name: companyCell.textContent.trim(),
        symbol: link ? link.textContent.trim() : '',
        pairId: pairEl ? pairEl.getAttribute('_p_pid') : '',
        url: link ? 'https://www.investing.com' + link.getAttribute('href') : ''
      };

      if (tds.length >= 8) {
        var epsActual = tds[2] ? tds[2].textContent.trim() : '';
        var epsForecast = tds[3] ? tds[3].textContent.trim().replace(/^\/\s*/, '').trim() : '';
        var revActual = tds[4] ? tds[4].textContent.trim() : '';
        var revForecast = tds[5] ? tds[5].textContent.trim().replace(/^\/\s*/, '').trim() : '';
        var marketCap = tds[6] ? tds[6].textContent.trim() : '';
        var time = timeSpan ? (timeSpan.getAttribute('data-tooltip') || '') : '';

        entry.eps_actual = epsActual !== '--' ? epsActual : null;
        entry.eps_forecast = epsForecast !== '--' ? epsForecast : null;
        entry.revenue_actual = revActual !== '--' ? revActual : null;
        entry.revenue_forecast = revForecast !== '--' ? revForecast : null;
        entry.market_cap = marketCap;
        entry.time = time || null;
      }

      allResults.push(entry);
    }

    allResults._lastTimeScope = data.last_time_scope;

    // No more pages
    if (!data.bind_scroll_handler) break;
    limitFrom = 1;
  }

  // Clean up internal property
  delete allResults._lastTimeScope;

  // Group by date
  var byDate = {};
  for (var j = 0; j < allResults.length; j++) {
    var d = allResults[j].date;
    if (!byDate[d]) byDate[d] = [];
    byDate[d].push(allResults[j]);
  }

  return {
    from: from,
    to: to,
    total: allResults.length,
    dates: Object.keys(byDate),
    earnings: byDate
  };
}
