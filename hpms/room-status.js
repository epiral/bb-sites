/* @meta
{
  "name": "hpms/room-status",
  "description": "HPMS room status - query room availability and details for a hotel",
  "domain": "hpms.igotrip.cn",
  "args": {
    "hotel_id": {"required": true, "description": "Hotel ID (e.g. 11469518)"}
  },
  "capabilities": ["eval", "network"],
  "readOnly": true,
  "example": "bb-browser site hpms/room-status --hotel_id 11469518"
}
*/

async function(args) {
  const hotelId = args.hotel_id;

  // Step 1: Login to get fresh JWT token
  const loginResponse = await fetch('https://gw.igotrip.cn/api/v2/hpms/org/user/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ account: 'zhong', password: 'C51718761' })
  });
  const loginData = await loginResponse.json();
  if (!loginData.data || !loginData.data.access_token) {
    return { error: 'Login failed: ' + JSON.stringify(loginData) };
  }
  const token = loginData.data.access_token;
  localStorage.setItem('hpms_ty_access_token', token);

  // Step 2: Fetch room status
  // API returns: data.data = {rows: [rooms], count: total}
  const roomUrl = `https://gw.igotrip.cn/api/v2/hpms/cms/room/hotel/query?hotel_id=${hotelId}&protocol_id=1`;
  const roomResponse = await fetch(roomUrl, {
    headers: { 'Authorization': 'Bearer ' + token },
    credentials: 'include'
  });
  const data = await roomResponse.json();

  if (data.code && data.code !== 200) {
    return { error: `Room API error: ${data.code} ${data.message}`, reason: data.reason };
  }

  const inner = data.data || {};
  const rooms = Array.isArray(inner.rows) ? inner.rows.map(r => ({
    room_type_id: r.room_type_id || r.id,
    room_type_name: r.room_type_name || r.name,
    status: r.status,
    available: r.available,
    price: r.price,
    raw: r
  })) : [];

  return {
    hotel_id: hotelId,
    token_expires_at: loginData.data.expires_at || '',
    total: inner.count || 0,
    rooms
  };
}
