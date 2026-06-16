/* @meta
{
  "name": "youtube/transcript",
  "description": "Get video transcript/captions (must be on the video page)",
  "domain": "www.youtube.com",
  "args": {
    "lang": {"required": false, "description": "Language code (default: first available, e.g. 'en', 'ja')"}
  },
  "capabilities": ["network"],
  "readOnly": true,
  "example": "bb-browser site youtube/transcript"
}
*/

async function(args) {
  const currentUrl = location.href;
  const match = currentUrl.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  if (!match) return {error: 'Not on a video page', hint: 'Navigate to a YouTube video page first (youtube.com/watch?v=...)'};

  const videoId = match[1];

  // Helper to read cookies
  const getCookie = (name) => {
    const matches = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/([\.$?*|{}\(\)\[\]\\\/\+^])/g, '\\$1') + '=([^;]*)'));
    return matches ? decodeURIComponent(matches[1]) : undefined;
  };

  // Extract SAPISID or fallbacks
  let sapisid = getCookie('SAPISID') || getCookie('__Secure-3PAPISID') || getCookie('__Secure-1PAPISID');
  if (!sapisid) {
    return {
      error: 'No authentication cookie (SAPISID) found',
      hint: 'Please make sure you are logged in to YouTube in this browser session.'
    };
  }

  // Compute SAPISIDHASH signature
  const now = Math.floor(Date.now() / 1000);
  const origin = window.location.origin;
  const msg = now + ' ' + sapisid + ' ' + origin;
  const msgBuffer = new TextEncoder().encode(msg);
  const hashBuffer = await crypto.subtle.digest('SHA-1', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  const authHeader = 'SAPISIDHASH ' + now + '_' + hashHex;

  // Get Innertube API key
  let apiKey = typeof ytcfg !== 'undefined' ? ytcfg.get('INNERTUBE_API_KEY') : null;
  if (!apiKey) {
    const html = document.documentElement.innerHTML;
    const keyMatch = html.match(/"INNERTUBE_API_KEY"\s*:\s*"([^"]+)"/);
    if (keyMatch) {
      apiKey = keyMatch[1];
    } else {
      return { error: 'Could not find INNERTUBE_API_KEY on the page' };
    }
  }

  // Call player API
  const playerUrl = '/youtubei/v1/player?key=' + apiKey;
  const payload = {
    videoId,
    context: {
      client: {
        clientName: 'WEB',
        clientVersion: '2.20240308.00.00',
        hl: 'en',
        gl: 'US'
      }
    }
  };

  let playerResponse;
  try {
    const res = await fetch(playerUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader
      },
      body: JSON.stringify(payload)
    });
    playerResponse = await res.json();
  } catch (e) {
    return { error: 'Failed to fetch player API: ' + e.message };
  }

  const playabilityStatus = playerResponse?.playabilityStatus?.status;
  if (playabilityStatus !== 'OK') {
    return {
      error: 'Video is not playable or requires login',
      status: playabilityStatus,
      reason: playerResponse?.playabilityStatus?.reason
    };
  }

  const captions = playerResponse?.captions?.playerCaptionsTracklistRenderer;
  const tracks = captions?.captionTracks || [];
  const availableTracks = tracks.map(t => ({
    lang: t.languageCode,
    name: t.name?.simpleText || t.name?.runs?.map(r => r.text).join('') || '',
    kind: t.kind || 'manual'
  }));

  if (tracks.length === 0) {
    return {
      error: 'No captions/subtitles available for this video',
      videoId,
      availableTracks
    };
  }

  // Find requested or default track
  let selectedTrack = tracks[0];
  if (args.lang) {
    const found = tracks.find(t => t.languageCode === args.lang);
    if (found) {
      selectedTrack = found;
    } else {
      return {
        error: 'Requested language "' + args.lang + '" not found',
        hint: 'Available languages: ' + availableTracks.map(t => t.lang + ' (' + t.name + ')').join(', '),
        videoId,
        availableTracks
      };
    }
  }

  // Fetch the subtitle file in JSON3 format
  let subtitleData;
  try {
    const srtRes = await fetch(selectedTrack.baseUrl + '&fmt=json3', {
      headers: {
        'Authorization': authHeader
      }
    });
    subtitleData = await srtRes.json();
  } catch (e) {
    return { error: 'Failed to fetch subtitle data: ' + e.message };
  }

  if (!subtitleData || !subtitleData.events) {
    return {
      error: 'Empty or invalid subtitle data returned',
      videoId,
      availableTracks
    };
  }

  // Parse events into segments
  const segments = subtitleData.events.map(event => {
    const start = event.tStartMs / 1000;
    const text = event.segs ? event.segs.map(s => s.utf8).join('') : '';
    
    const formatTime = (s) => {
      const hrs = Math.floor(s / 3600);
      const mins = Math.floor((s % 3600) / 60);
      const secs = Math.floor(s % 60);
      if (hrs > 0) {
        return hrs + ':' + String(mins).padStart(2, '0') + ':' + String(secs).padStart(2, '0');
      }
      return mins + ':' + String(secs).padStart(2, '0');
    };
    
    return {
      start,
      startFormatted: formatTime(start),
      text: text.trim()
    };
  }).filter(s => s.text);

  const fullText = segments.map(s => s.text).join(' ');
  const lastSeg = segments[segments.length - 1];
  const totalDuration = lastSeg ? lastSeg.start + 10 : 0;

  return {
    videoId,
    language: selectedTrack.languageCode,
    languageName: selectedTrack.name?.simpleText || selectedTrack.name?.runs?.map(r => r.text).join('') || '',
    kind: selectedTrack.kind || 'manual',
    segmentCount: segments.length,
    totalDuration,
    availableTracks,
    segments,
    fullText: fullText.substring(0, 5000)
  };
}
