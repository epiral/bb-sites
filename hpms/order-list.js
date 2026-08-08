/* @meta
{
  "name": "hpms/order-list",
  "description": "HPMS order list - query recent orders from HPMS",
  "domain": "hpms.igotrip.cn",
  "args": {
    "page": {"required": false, "description": "Page number (default 1)"},
    "page_size": {"required": false, "description": "Page size (default 20)"}
  },
  "capabilities": ["eval", "network"],
  "readOnly": true,
  "example": "bb-browser site hpms/order-list --page 1 --page_size 20"
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
  
  // Step 2: Fetch order list
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 30);
  const startStr = startDate.toISOString().replace('T', ' ').slice(0, 19);
  const endStr = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const url = `https://gw.igotrip.cn/api/v2/hpms/order/list?page=${page}&page_size=${pageSize}&created_at_start=${encodeURIComponent(startStr)}&created_at_end=${encodeURIComponent(endStr)}`;
  
  const result = await fetch(url, {
    headers: { 'Authorization': 'Bearer ' + token },
    credentials: 'include'
  });
  const data = await result.json();
  
  if (data.code && data.code !== 200) {
    return { error: `HPMS API error: ${data.code} ${data.message}`, reason: data.reason };
  }
  
  // Normalize: data.counts = total, data.result = orders array
  const total = data.data && data.data.counts ? data.data.counts : 0;
  const orders = (data.data && data.data.result ? data.data.result : []).map(order => ({
    order_id: order.order_id,
    distributor_order_id: order.distributor_order_id,
    hotel_name: order.hotel_name,
    room_name: order.room_name,
    room_nights: order.room_nights_num,
    check_in: order.check_in_time,
    check_out: order.check_out_time,
    status: order.order_status,
    distributor: order.distributor_name,
    supplier: order.supplier_name,
    selling_price: order.order_amount ? order.order_amount / 100 : null, // in yuan
    purchase_price: order.supplier_order_amount ? order.supplier_order_amount / 100 : null,
    created_at: order.created_at,
    update_at: order.update_at,
    consumer: order.consumer,
    raw: order
  }));
  
  return {
    page,
    pageSize,
    total,
    token_expires_at: loginData.data.expires_at || '',
    orders
  };
}
