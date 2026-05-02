/* @meta
{
  "name": "hpms/hotel-list",
  "description": "HPMS hotel list - get all hotels in the account",
  "domain": "hpms.igotrip.cn",
  "args": {
    "page": {"required": false, "description": "Page number (default 1)"},
    "page_size": {"required": false, "description": "Page size (default 20)"}
  },
  "capabilities": ["eval", "network"],
  "readOnly": true,
  "example": "bb-browser site hpms/hotel-list --page 1 --page_size 20"
}
*/

async function(args) {
  const page = parseInt(args.page) || 1;
  const pageSize = parseInt(args.page_size) || 20;

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

  // Step 2: Fetch hotel list
  // API returns nested: response.data = {code, message, count, data: [hotels]}
  const url = `https://gw.igotrip.cn/api/v2/hpms/hotel/list?page_size=${pageSize}&page_index=${page}&need_count=true`;
  const response = await fetch(url, {
    headers: { 'Authorization': 'Bearer ' + token },
    credentials: 'include'
  });
  const data = await response.json();

  if (data.code && data.code !== 200) {
    return { error: `HPMS API error: ${data.code} ${data.message}`, reason: data.reason };
  }

  // Navigate nested response: data.data = {code, message, count, data: [hotels]}
  const inner = data.data || {};
  const total = parseInt(inner.count) || 0;
  const hotelArray = Array.isArray(inner.data) ? inner.data : [];

  const hotels = hotelArray.map(h => ({
    hotel_id: h.hotel_id,
    name: h.name || '(无名称)',
    province: h.province_name,
    city: h.city_name,
    area: h.area_name,
    address: h.address_line,
    contact: h.hotel_contact,
    room_count: h.room_count,
    status: h.supplier_hotel_status,
    raw: h
  }));

  return {
    page,
    pageSize,
    total,
    token_expires_at: loginData.data.expires_at || '',
    hotels
  };
}
