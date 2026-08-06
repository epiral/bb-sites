/* @meta
{
  "name": "12306/find-trains",
  "description": "中国铁路12306列车查询 - 查询两站之间指定日期的列车时刻和余票 (train schedule: trainNumber, departureTime, arrivalTime, duration, seatAvailability)",
  "domain": "kyfw.12306.cn",
  "args": {
    "from": {"required": true, "description": "出发站，支持中文名（如'北京南'）或车站代码（如'VNP'）"},
    "to": {"required": true, "description": "到达站，支持中文名或车站代码"},
    "date": {"required": false, "description": "日期，YYYY-MM-DD格式（默认当天）"}
  },
  "readOnly": true,
  "example": "bb-browser site 12306/find-trains \"北京南\" \"上海虹桥\" --date \"2026-05-25\""
}
*/

async function(args) {
  const from = args.from?.trim();
  const to = args.to?.trim();
  if (!from) return {error: 'Missing argument: from (出发站)'};
  if (!to) return {error: 'Missing argument: to (到达站)'};

  // Default date: today in Beijing time
  const now = new Date();
  const tzOffset = now.getTimezoneOffset();
  const beijingOffset = -480; // UTC+8
  const beijingDate = new Date(now.getTime() + (beijingOffset - tzOffset) * 60000);
  const dateStr = args.date || beijingDate.toISOString().slice(0, 10);

  // --- Step 1: Resolve station codes ---
  let fromCode = from;
  let toCode = to;

  // If input is not already a station code (2-4 uppercase letters), look up by name
  if (!/^[A-Z]{2,4}$/.test(from) || !/^[A-Z]{2,4}$/.test(to)) {
    try {
      const stationResp = await fetch('https://kyfw.12306.cn/otn/resources/js/framework/station_name.js', {
        credentials: 'include'
      });
      const stationText = await stationResp.text();

      // Parse: var station_names = '@bjb|北京北|...@bjd|北京东|...'
      const stationMap = {};
      const regex = /@([a-z]+)\|([^|]+)/g;
      let match;
      while ((match = regex.exec(stationText)) !== null) {
        stationMap[match[2]] = match[1]; // name → code (lowercase)
      }

      // Try exact match first, then prefix match
      fromCode = stationMap[from];
      toCode = stationMap[to];

      if (!fromCode) {
        // Fuzzy match: find first station containing the input
        for (const [name, code] of Object.entries(stationMap)) {
          if (name.includes(from)) { fromCode = code; break; }
        }
      }
      if (!toCode) {
        for (const [name, code] of Object.entries(stationMap)) {
          if (name.includes(to)) { toCode = code; break; }
        }
      }

      // 12306 API uses UPPERCASE codes
      if (fromCode) fromCode = fromCode.toUpperCase();
      if (toCode) toCode = toCode.toUpperCase();

      if (!fromCode) return {error: `未找到车站：${from}`, hint: `请尝试完整名称，如"北京南"、"上海虹桥"`};
      if (!toCode) return {error: `未找到车站：${to}`, hint: `请尝试完整名称`};
    } catch(e) {
      return {error: `无法加载车站代码表: ${e.message}`};
    }
  }

  // Format date for 12306 API (YYYYMMDD without dashes)
  const apiDate = dateStr.replace(/-/g, '');

  // --- Step 2: Query API (from browser context with session cookies) ---
  let trainData = null;
  let errorMsg = null;

  try {
    const apiUrl = `https://kyfw.12306.cn/otn/leftTicket/queryZ?leftTicketDTO.train_date=${apiDate}&leftTicketDTO.from_station=${fromCode}&leftTicketDTO.to_station=${toCode}&purpose_codes=ADULT`;
    const resp = await fetch(apiUrl, {
      headers: {
        'Referer': 'https://kyfw.12306.cn/otn/leftTicket/init',
        'Accept': 'application/json'
      },
      credentials: 'include'
    });

    if (resp.ok) {
      const data = await resp.json();
      if (data?.data?.result?.length > 0) {
        const map = data.data.map || {};
        trainData = data.data.result;
      } else {
        errorMsg = data?.data || '查询结果为空';
      }
    } else {
      errorMsg = `HTTP ${resp.status}: ${resp.statusText}`;
    }
  } catch(e) {
    errorMsg = `API 请求失败: ${e.message}`;
  }

  // --- Step 3: Parse train data ---
  // 12306 returns | delimited format with ~60 fields per row
  if (trainData) {
    const trains = trainData.map(row => {
      const parts = row.split('|');
      return {
        trainNumber: parts[3],
        fromStationCode: parts[6],
        toStationCode: parts[7],
        startTime: parts[8],
        endTime: parts[9],
        duration: parts[10],
        canBuy: parts[11] === 'Y',
        date: parts[13],
        seats: {
          swz: parts[32] || '-',     // 商务座/特等座
          yd: parts[31] || '-',       // 一等座
          ed: parts[30] || '-',       // 二等座
          rw: parts[23] || '-',       // 软卧
          dw: parts[27] || '-',       // 动卧
          yw: parts[28] || '-',       // 硬卧
          yz: parts[29] || '-',       // 硬座
          wz: parts[26] || '-'        // 无座
        }
      };
    });

    const result = {
      from: from,
      to: to,
      date: dateStr,
      apiDate: apiDate,
      fromStationCode: fromCode,
      toStationCode: toCode,
      totalTrains: trains.length,
      trains: trains,
      source: 'kyfw_api'
    };

    // Add station name mapping if available
    if (data?.data?.map) {
      const stationNames = {};
      for (const [code, name] of Object.entries(data.data.map)) {
        stationNames[code] = name;
      }
      result.stationNames = stationNames;
    }

    return result;
  }

  // --- Step 4: Browser fallback (if API failed) ---
  try {
    const initUrl = 'https://kyfw.12306.cn/otn/leftTicket/init';
    await fetch(initUrl, {credentials: 'include'});

    const queryUrl = `https://kyfw.12306.cn/otn/leftTicket/query?leftTicketDTO.train_date=${dateStr}&leftTicketDTO.from_station=${fromCode}&leftTicketDTO.to_station=${toCode}&purpose_codes=ADULT`;
    const resp = await fetch(queryUrl, {
      headers: {'Referer': initUrl, 'Accept': 'text/html'},
      credentials: 'include'
    });
    const html = await resp.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    const table = doc.querySelector('#queryLeftTable');
    if (table) {
      const trains = [];
      table.querySelectorAll('tr').forEach(row => {
        const trainEl = row.querySelector('.train');
        if (!trainEl) return;
        trains.push({
          trainNumber: trainEl.textContent?.trim(),
          fromStationCode: row.querySelector('.from')?.textContent?.trim(),
          toStationCode: row.querySelector('.to')?.textContent?.trim(),
          startTime: row.querySelector('.start-t')?.textContent?.trim(),
          endTime: row.querySelector('.end-t')?.textContent?.trim(),
          duration: row.querySelector('.during')?.textContent?.trim()
        });
      });
      if (trains.length > 0) {
        return {from, to, date: dateStr, totalTrains: trains.length, trains, source: 'browser_html'};
      }
    }
  } catch(e) {
    // Both API and browser failed
  }

  return {
    error: errorMsg || '查询失败',
    from, to, date: dateStr,
    hint: '请先在浏览器中打开 kyfw.12306.cn 并确保有有效 session，然后重试。或者检查车站名称是否正确。',
    action: 'bb-browser open https://kyfw.12306.cn/otn/leftTicket/init'
  };
}
