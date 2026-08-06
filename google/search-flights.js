/* @meta
{
  "name": "google/search-flights",
  "description": "Google航班搜索 - 查询航班价格和时刻 (flight search: airline, flightNumber, departureTime, arrivalTime, duration, price, stops)",
  "domain": "google.com",
  "args": {
    "from": {"required": true, "description": "出发机场代码，如 PEK"},
    "to": {"required": true, "description": "到达机场代码，如 LAX"},
    "date": {"required": true, "description": "日期，YYYY-MM-DD格式"}
  },
  "readOnly": true,
  "tags": ["travel", "flights", "search", "google", "read-only", "anti-bot"],
  "example": "bb-browser site google/search-flights PEK LAX --date 2026-05-25"
}
*/

async function(args) {
  var from = (args.from || '').trim().toUpperCase();
  var to = (args.to || '').trim().toUpperCase();
  var date = (args.date || '').trim();

  if (!from) return {error: '缺少参数：from（出发机场代码）', hint: '请输入机场代码，如 PEK（北京首都）'};
  if (!to) return {error: '缺少参数：to（到达机场代码）', hint: '请输入机场代码，如 LAX（洛杉矶）'};
  if (!date) return {error: '缺少参数：date（日期）', hint: '请输入日期，格式 YYYY-MM-DD'};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return {error: '日期格式错误', hint: '请使用 YYYY-MM-DD 格式，如 2026-05-25'};

  var url = 'https://www.google.com/travel/flights?q=Flights+to+' + to + '+from+' + from + '+on+' + date;

  // Try to use the AF_initData embedded JSON data first (most complete)
  var afResult = await tryExtractAFInitData(url);
  if (afResult) return afResult;

  // Fallback: extract from rendered DOM
  var domResult = await tryExtractFromDOM(url);
  if (domResult) return domResult;

  return {error: '无法提取航班数据', hint: 'Google Flights 禁止程序化访问。请先用浏览器打开 ' + url, from: from, to: to, date: date};

  // ------------------------------------------------------------------
  // Strategy 1: Extract from AF_initDataCallback embedded JSON
  // ------------------------------------------------------------------
  async function tryExtractAFInitData(pageUrl) {
    var resp = await fetch(pageUrl, {credentials: 'include'});
    if (!resp.ok) return null;
    var html = await resp.text();

    // Extract AF_initDataCallback for ds:1 which contains flight data
    // The data is deeply nested protobuf-style arrays
    var idx = html.indexOf("AF_initDataCallback({key:'ds:1'");
    if (idx === -1) {
      idx = html.indexOf('AF_initDataCallback({key: "ds:1"');
    }
    if (idx === -1) {
      idx = html.indexOf("key: 'ds:1'");
      if (idx === -1) {
        idx = html.indexOf('key: "ds:1"');
      }
      if (idx !== -1) {
        // Find the AF_initDataCallback containing this key
        var before = html.lastIndexOf('AF_initDataCallback({', idx);
        if (before === -1) return null;
        idx = before;
      } else {
        return null;
      }
    }

    // Find the end of the callback: search for matching braces
    // Format: AF_initDataCallback({key:'ds:1',hash:'9',data:[[...]]})
    var start = html.indexOf('{', idx);
    if (start === -1) return null;

    var depth = 0;
    var inStr = false;
    var esc = false;
    var end = -1;
    for (var i = start; i < html.length; i++) {
      var ch = html[i];
      if (esc) { esc = false; continue; }
      if (ch === '\\' && inStr) { esc = true; continue; }
      if (ch === '"' || ch === "'") { inStr = !inStr; continue; }
      if (inStr) continue;
      if (ch === '{') depth++;
      if (ch === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end === -1) return null;

    var cbData = html.substring(start, end + 1);
    try {
      var cbObj = JSON.parse(cbData);
      var rawData = cbObj.data;
      if (!Array.isArray(rawData)) return null;
      
      var flights = parseAFData(rawData);
      if (flights && flights.length > 0) {
        return {
          from: from,
          to: to,
          date: date,
          totalResults: flights.length,
          flights: flights,
          source: 'af_init_data'
        };
      }
    } catch(e) {
      // Fall through
    }
    return null;
  }

  // ------------------------------------------------------------------
  // Strategy 2: Extract from rendered DOM (browser context)
  // ------------------------------------------------------------------
  async function tryExtractFromDOM(pageUrl) {
    // Check if we're already on Google Flights
    var isOnFlights = typeof window !== 'undefined' && window.location && 
                      window.location.href && window.location.href.indexOf('google.com/travel/flights') !== -1;
    
    if (!isOnFlights) {
      // We're in fetch context, can't use DOM
      return null;
    }

    // Wait for results to render
    await new Promise(function(r) { setTimeout(r, 3000); });

    // Find flight result cards - each card has an anchor div with aria-label
    // The card structure: div with role="link" or aria-label containing flight info
    var flightCards = document.querySelectorAll('[aria-label*="From "][aria-label*="dollars"]');
    if (flightCards.length === 0) {
      // Try broader selectors
      flightCards = document.querySelectorAll('[aria-label*="flight"][aria-label*="dollars"]');
    }
    if (flightCards.length === 0) {
      // Try the card divs that have click handlers
      flightCards = document.querySelectorAll('.JMc5Xc[aria-label]');
    }

    var flights = [];
    for (var c = 0; c < flightCards.length; c++) {
      var label = flightCards[c].getAttribute('aria-label') || '';
      var parsed = parseAriaLabel(label);
      if (parsed && parsed.airline) {
        flights.push(parsed);
      }
    }

    if (flights.length === 0) return null;

    return {
      from: from,
      to: to,
      date: date,
      totalResults: flights.length,
      flights: flights,
      source: 'dom_aria'
    };
  }

  // ------------------------------------------------------------------
  // Parse aria-label text from flight card
  // Format: "From 1172 US dollars round trip total. 1 stop flight with EVA Air. Leaves Beijing Capital International Airport at 8:45 PM on Monday, May 25 and arrives at Los Angeles International Airport at 7:10 AM on Tuesday, May 26. Total duration 25 hr 25 min. ... Select flight"
  // ------------------------------------------------------------------
  function parseAriaLabel(label) {
    if (!label || label.indexOf('From ') === -1) return null;

    var priceMatch = label.match(/From\s+([\d,]+)\s+([A-Z]+)\s+dollars/i);
    var price = null;
    var currency = 'USD';
    if (priceMatch) {
      price = parseInt(priceMatch[1].replace(/,/g, ''));
      currency = priceMatch[2];
    }

    var stopsMatch = label.match(/(\d+)\s+stop\s+flight/i);
    var stops = stopsMatch ? parseInt(stopsMatch[1]) : 0;

    var airlineMatch = label.match(/flight\s+with\s+([^.]+?)(?:\.|Leaves)/i);
    var airline = airlineMatch ? airlineMatch[1].trim() : '';

    var departMatch = label.match(/Leaves\s+(?:[^.]*?)\s+at\s+([\d:]+\s*(?:AM|PM))/i);
    var arriveMatch = label.match(/arrives\s+(?:[^.]*?)\s+at\s+([\d:]+\s*(?:AM|PM)(?:\+1)?)/i);
    var durMatch = label.match(/Total\s+duration\s+(\d+\s+hr\s+\d+\s+min)/i);

    return {
      airline: airline,
      departureTime: departMatch ? departMatch[1] : '',
      arrivalTime: arriveMatch ? arriveMatch[1] : '',
      duration: durMatch ? durMatch[1] : '',
      stops: stops,
      price: price ? currency + ' ' + price : null,
      priceValue: price
    };
  }

  // ------------------------------------------------------------------
  // Parse Google's protobuf-style nested array data
  // ------------------------------------------------------------------
  function parseAFData(data) {
    if (!Array.isArray(data)) return null;

    // Navigate: data[0] = metadata, data[1] = main content
    // data[1] contains [airportInfo, flightGroups, ...]
    var mainContent = data[1];
    if (!Array.isArray(mainContent)) return null;

    // Find flight group entries
    var flightGroups = null;
    for (var gi = 0; gi < mainContent.length; gi++) {
      var candidate = mainContent[gi];
      if (!Array.isArray(candidate) || candidate.length < 3) continue;
      
      // Check if this array contains flight entries
      // Flight entry: [airlineCode (string), [airlineName], [legs], fromAirport, ...]
      for (var si = 0; si < Math.min(candidate.length, 20); si++) {
        var entry = candidate[si];
        if (!Array.isArray(entry) || entry.length < 10) continue;
        
        var code = entry[0];
        if (typeof code === 'string' && code.length <= 3 && /^[A-Z0-9]{2,3}$/.test(code)) {
          var nameEntry = entry[1];
          var legsEntry = entry[2];
          if ((Array.isArray(nameEntry) || typeof nameEntry === 'string') && Array.isArray(legsEntry) && legsEntry.length > 0) {
            flightGroups = candidate;
            break;
          }
        }
      }
      if (flightGroups) break;
    }

    if (!flightGroups) return null;

    var flights = [];
    for (var g = 0; g < flightGroups.length; g++) {
      var group = flightGroups[g];
      if (!Array.isArray(group) || group.length < 10) continue;

      var airlineCode = group[0];
      if (typeof airlineCode !== 'string' || airlineCode.length > 3) continue;

      var airlineNameArr = group[1];
      var airlineName = Array.isArray(airlineNameArr) ? airlineNameArr[0] : (airlineNameArr || '');

      var legs = group[2];
      if (!Array.isArray(legs) || legs.length === 0) continue;

      var totalDuration = group[9];

      // Parse each leg
      var legDetails = [];
      for (var l = 0; l < legs.length; l++) {
        var leg = legs[l];
        if (!Array.isArray(leg)) continue;

        var legFrom = leg[3];
        var legTo = leg[6];
        var depTimeArr = leg[8];
        var arrTimeArr = leg[10];
        var duration = leg[11];
        var fnInfo = leg[26];
        var flightNum = Array.isArray(fnInfo) ? String(fnInfo[1] || '') : '';

        if (Array.isArray(depTimeArr) && Array.isArray(arrTimeArr)) {
          var depH = String(depTimeArr[0]).padStart(2, '0');
          var depM = String(depTimeArr[1]).padStart(2, '0');
          var arrH = String(arrTimeArr[0]).padStart(2, '0');
          var arrM = String(arrTimeArr[1]).padStart(2, '0');
          var durH = Math.floor(duration / 60);
          var durM = duration % 60;

          legDetails.push({
            flightNumber: flightNum,
            fromAirport: legFrom || '',
            toAirport: legTo || '',
            departureTime: depH + ':' + depM,
            arrivalTime: arrH + ':' + arrM,
            duration: durH + 'h ' + durM + 'm',
            durationMinutes: duration
          });
        }
      }

      if (legDetails.length === 0) continue;

      var stops = legDetails.length - 1;
      var price = findPriceInData(group);

      var totalDurStr = '';
      if (totalDuration) {
        var tdH = Math.floor(totalDuration / 60);
        var tdM = totalDuration % 60;
        totalDurStr = tdH + 'h ' + tdM + 'm';
      }

      flights.push({
        airline: airlineName || airlineCode,
        airlineCode: airlineCode,
        flightNumber: legDetails.map(function(l) { return l.flightNumber; }).filter(Boolean).join(' / '),
        departureTime: legDetails[0].departureTime,
        arrivalTime: legDetails[legDetails.length - 1].arrivalTime,
        departureAirport: legDetails[0].fromAirport,
        arrivalAirport: legDetails[legDetails.length - 1].toAirport,
        duration: totalDurStr || legDetails.map(function(l) { return l.duration; }).join(' + '),
        durationMinutes: totalDuration || legDetails.reduce(function(s, l) { return s + (l.durationMinutes || 0); }, 0),
        stops: stops,
        stopsDetail: stops > 0 ? legDetails.slice(1).map(function(l) { return l.fromAirport; }) : [],
        price: price ? '$' + price : null,
        priceValue: price,
        legs: legDetails
      });
    }

    return flights.length > 0 ? flights : null;
  }

  function findPriceInData(obj, depth) {
    if (depth === undefined) depth = 0;
    if (depth > 8) return null;
    if (!Array.isArray(obj)) return null;

    for (var i = 0; i < obj.length; i++) {
      var val = obj[i];
      if (Array.isArray(val)) {
        // Google Flights price pattern: [null, null, 1, X, null, 1, 1, priceInCents, ...]
        if (val.length >= 8 &&
            val[0] === null && val[1] === null &&
            val[2] === 1 && val[5] === 1 && val[6] === 1 &&
            typeof val[7] === 'number' && val[7] > 100000) {
          return Math.round(val[7] / 100);
        }
        // Alternative: [null, null, 1, X, null, 1, 1, priceA, priceB, ...]
        if (val.length >= 10 &&
            val[0] === null && val[1] === null &&
            val[2] === 1 && val[5] === 1 && val[6] === 1 &&
            typeof val[7] === 'number' && val[7] > 10000 &&
            typeof val[8] === 'number' && val[8] > 10000) {
          return Math.round(val[7] / 100);
        }
        // Shorter: [null, largeNumber]
        if (val.length === 2 && val[0] === null && typeof val[1] === 'number' && val[1] > 100000) {
          return Math.round(val[1] / 100);
        }
        var found = findPriceInData(val, depth + 1);
        if (found) return found;
      }
    }
    return null;
  }
}
