const fs = require('fs');
const { JSDOM } = require('jsdom');

// 讀取原始 Buffer 以便進行編碼判斷
const buffer = fs.readFileSync('./1688_edc.html');
let html = buffer.toString('utf8');

// 檢查是否包含 GBK 宣告，如果是則重新用 GBK 解碼
if (html.includes('charset=gbk') || html.includes('charset="gbk"') || /[\uFFFD]/.test(html)) {
  try {
    const { TextDecoder } = require('util');
    html = new TextDecoder('gbk').decode(buffer);
    console.log('📝 已檢測到 GBK 編碼，執行自動轉碼...');
  } catch (e) {
    console.warn('⚠️ 自動轉碼失敗，保持 UTF-8');
  }
}

const dom = new JSDOM(html);
const document = dom.window.document;

const products = [];

// 匹配所有商品元素
const items = document.querySelectorAll('[class*="offer-item"], [class*="sm-offer"], [class*="card-offer"]');

items.forEach(item => {
  const text = item.innerText || '';
  const links = Array.from(item.querySelectorAll('a')).map(a => a.href).filter(h => h.includes('detail.1688.com'));
  const url = links[0] || '';
  
  // 提取標題（包含EDC/玩具等關鍵詞）
  let title = '';
  const titleEl = item.querySelector('[title], .subject, .title, .name');
  if (titleEl) title = titleEl.innerText.trim();
  if (!title && text.includes('EDC') || text.includes('解壓') || text.includes('指尖') || text.includes('玩具')) {
    title = text.split('\n').find(line => line.length > 10 && (line.includes('EDC') || line.includes('玩具') || line.includes('指尖'))) || '';
  }
  
  // 提取價格
  const priceMatch = text.match(/¥\s*([0-9.]+)/);
  const price = priceMatch ? `¥${priceMatch[1]}` : '';
  
  // 提取銷量
  const salesMatch = text.match(/([0-9.]+[萬k]?\+?)\s*(成交|件|銷量|已售)/i);
  const sales = salesMatch ? salesMatch[0] : '';
  
  // 提取公司名
  const companyMatch = text.match(/(有限公司|廠|商行|工廠|店)/i);
  let company = '';
  if (companyMatch) {
    const lines = text.split('\n');
    company = lines.find(line => line.includes('有限公司') || line.includes('廠') || line.includes('商行')) || '';
  }
  
  if (title && price && url) {
    products.push({
      title: title.trim().replace(/\s+/g, ' '),
      price,
      sales: sales || '暫無數據',
      company: company.trim() || '未知商家',
      url
    });
  }
});

// 去重
const uniqueProducts = Array.from(new Map(products.map(p => [p.url, p])).values());

// 按價格排序
uniqueProducts.sort((a, b) => parseFloat(a.price.replace('¥', '')) - parseFloat(b.price.replace('¥', '')));

console.log('🎉 1688 EDC玩具提取成功！共找到', uniqueProducts.length, '個有效商品\n');
console.log('🏆 按價格排序的高評價商品：');
console.log('='.repeat(100));

uniqueProducts.slice(0, 15).forEach((p, i) => {
  console.log(`\n${i+1}. 🎁 ${p.title}`);
  console.log(`   💰 價格：${p.price}`);
  console.log(`   📈 銷量：${p.sales}`);
  console.log(`   🏭 商家：${p.company}`);
  console.log(`   🔗 鏈接：${p.url}`);
});

// 保存結果
fs.writeFileSync('./1688_edc_result.json', JSON.stringify(uniqueProducts, null, 2), 'utf8');
console.log(`\n💾 完整數據已保存到：D:\\Code practice\\E commce\\1688\\1688_edc_result.json`);
