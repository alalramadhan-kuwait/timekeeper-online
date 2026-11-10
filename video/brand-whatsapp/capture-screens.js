// Real DSR app (vite dev) with every Supabase call answered from masked data, for the
// feature video. Brand counts, Dennison amounts and dates are real (owner's view, 1 Nov 2026);
// customer names and numbers are replaced. Rows 13-654 are not shown on screen: they carry
// an equal share of the remaining real Dennison total so the totals on screen stay true.
const { chromium } = require('playwright');
const fs = require('fs');
const OUT = __dirname + '/assets/';   // run the DSR app first: npx vite --port 5199 (env from .env.production)
const APP = 'http://localhost:5199';
const REF = 'ttshgrujnycapugrmyxs';
const ONLY = process.argv[2];

const ar = n => String(n).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[d]);
const uid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const phone = n => `+9650000${String(n).padStart(4, '0')}`;
const iso = d => d ? `${d}T12:00:00+00:00` : null;

// n,pieces,kd,lastBought,asked,purchases,purchasesKD,lastPurchase,lastVisit
const top = `1,10,3440,2026-08-07,,5,3440,2026-08-07,
2,11,2070,2026-10-14,,19,7249.25,2026-10-15,
3,8,1990,2026-03-21,,2,2099,2026-03-21,
4,9,1970,2026-10-16,,5,1841,2026-10-16,
5,8,1840,2025-03-23,,40,19713.5,2026-03-23,
6,11,1800,2026-10-16,,17,2382,2026-10-26,
7,3,1775,2026-09-22,,1,1650,2026-09-22,
8,2,1740,2026-08-09,,1,1740,2026-08-09,
9,9,1545,2026-08-30,,89,9478.98,2026-09-06,
10,1,1500,2026-08-05,,1,1500,2026-08-05,
11,6,1480,2026-09-17,,3,1730,2026-09-17,
12,6,1470,2025-12-20,,1,1293.6,2025-12-20,`.split('\n').map(l => l.split(','));
const askedOnly = [[655, '2026-05-30', 5, 190.75, '2026-04-04', '2026-05-30'], [656, '2026-06-05', 0, 0, null, '2026-06-05'],
  [657, '2026-05-30', 2, 221, '2025-11-14', '2026-05-30'], [658, '2026-05-29', 0, 0, null, '2026-05-29'],
  [659, '2026-07-20', 1, 35, '2026-10-26', '2026-07-20'], [660, '2026-07-01', 0, 0, null, '2026-07-01'],
  [661, '2026-06-28', 0, 0, null, '2026-06-28'], [662, '2026-09-26', 0, 0, null, '2026-09-26'],
  [663, '2026-07-01', 0, 0, null, '2026-07-01'], [664, '2026-06-20', 0, 0, null, '2026-06-20']];
const askedAmongBought = { 14: '2026-06-11', 31: '2026-06-29', 84: '2026-06-03', 290: '2026-06-02', 578: '2026-09-17', 600: '2026-09-17', 652: '2026-09-24' };
const TOTAL_KD = 226244, TOTAL_CUSTOMERS = 9115;

const brandRows = [], listRows = [];
const listRow = (n, o = {}) => ({ id: uid(n), name: `عميل ${ar(n)}`, contact: phone(n), phone_e164: phone(n), is_vip: false,
  responsible_employee_id: null, responsible: null, mine: false, visits: 0, last_visit: null, open_followups: 0,
  purchases: 0, purchases_kd: 0, last_purchase: null, next_occasion: null, next_occasion_label: null, next_occasion_days: null, ...o });
let topKd = 0;
for (const [n, pieces, kd, lb, asked, pc, pkd, lp, lv] of top) {
  topKd += +kd;
  brandRows.push({ customer_id: uid(n), pieces: +pieces, kd: +kd, last_bought: iso(lb), models: [], asked_at: iso(asked), last_whatsapp: null });
  listRows.push(listRow(+n, { purchases: +pc, purchases_kd: +pkd, last_purchase: iso(lp), last_visit: iso(lv) }));
}
const share = Math.round((TOTAL_KD - topKd) / 642 * 1000) / 1000;
for (let n = 13; n <= 654; n++) {
  const kd = n === 654 ? Math.round((TOTAL_KD - topKd - share * 641) * 1000) / 1000 : share;
  brandRows.push({ customer_id: uid(n), pieces: 1, kd, last_bought: iso('2026-06-01'), models: [], asked_at: iso(askedAmongBought[n]), last_whatsapp: null });
  listRows.push(listRow(n, { purchases: 1, purchases_kd: kd, last_purchase: iso('2026-06-01') }));
}
for (const [n, asked, pc, pkd, lp, lv] of askedOnly) {
  brandRows.push({ customer_id: uid(n), pieces: 0, kd: 0, last_bought: null, models: [], asked_at: iso(asked), last_whatsapp: null });
  listRows.push(listRow(n, { purchases: pc, purchases_kd: pkd, last_purchase: iso(lp), last_visit: iso(lv) }));
}
for (let n = 665; n <= TOTAL_CUSTOMERS; n++) listRows.push(listRow(n));
brandRows.sort((a, b) => a.customer_id.localeCompare(b.customer_id));
// real model names of the top six Dennison buyers
const models = { 1: ['ALD Dual Time – Tiger Eye - Sunray In Gold', 'ALD Mini - Diamonds - Black Onyx', 'ALD Mini - Diamonds - Lagoon Jadeite'],
  2: ['Bark Mesh Bracelet Regular', 'Mini Bark Mesh Bracelet', 'Pietersite - Time Keeper Edition - Gold'],
  3: ['ALD Black Marble In Steel', 'Capsule Collection II Onyx & Pink Lacquer', 'Midnight Aventurine in Stainless'],
  4: ['ALD Mini - Diamonds - White MOP', 'Bark Mesh Bracelet Regular', 'Mini Bark Mesh Bracelet'],
  5: ['Midnight Aventurine in Gold Stainless', 'Natural Malachite Stone in Gold Stainless', 'Natural Stone Lapis Lazuli in Gold Stainless'],
  6: ['ALD Dual Time - Malachite – Green Sunray In Gold', 'ALD Dual Time - Malachite – Green Sunray In Steel', 'ALD Dual Time - Tiger’s eye–Marble In Gold'] };
for (const [n, m] of Object.entries(models)) brandRows.find(r => r.customer_id === uid(+n)).models = m;

const counts = [["West End",2042,5,612953.75,"stnd"],["Delugs",2033,18,157708.973,"dljs"],["Time Keeper",1704,0,69483.49,"tmkbr"],["Hoffman",760,4,97819.165,"hfmn"],["WMT",732,1,186277,"mt"],["Dennison",654,17,226244,"dnsn"],["AIS Collective",650,0,12152.53,"sklktf"],["Citizen",371,7,56029.597,"stsn"],["DVO - Italia",324,5,35695,"dftl"],["Wolf",253,0,48117.35,"lf"],["Swatch",223,0,9660.2,"sc"],["Luminox",206,0,40831.504,"lmnks"],["Behrens Original",196,1,260725.18,"bhrnsrjnl"]]
  .map(([brand, bought, asked, kd, skeleton]) => ({ brand, bought, asked, kd, skeleton }));

const templates = [
  { key: 'brand_news', lang: 'ar', title: 'جديد الماركة', body: 'السلام عليكم {{first_name}}، معك {{salesperson}} من تايم كيبر {{store}}. وصلنا جديد {{product}} وتذكرتك. تحب أرسل لك الصور؟' },
  { key: 'brand_news', lang: 'en', title: 'New from the brand', body: 'Hello {{first_name}}, this is {{salesperson}} from Time Keeper {{store}}. We have new pieces from {{product}} and I thought of you. Shall I send you some photos?' },
  { key: 'general_followup', lang: 'ar', title: 'متابعة عامة', body: 'السلام عليكم {{first_name}}، معك {{salesperson}} من تايم كيبر {{store}}. حبيت أطمّن عليك، وإذا تحتاج أي شيء أنا بالخدمة.' },
  { key: 'general_followup', lang: 'en', title: 'General follow-up', body: 'Hello {{first_name}}, this is {{salesperson}} from Time Keeper {{store}}. Just checking in — let me know if I can help with anything.' },
  { key: 'post_sale_checkin', lang: 'en', title: 'Post-sale check-in', body: 'Hello {{first_name}}, {{salesperson}} from Time Keeper {{store}} here. I hope you are enjoying your {{product}}.' },
];

// customer 2's real purchases (masked customer), newest first
const P = (at, outlet, total, items, ret = false) => ({ id: at, at, outlet, total, status: 'CLOSED', is_return: ret, receipt: null, salesperson: null,
  items: items.map(([name, brand, qty, t]) => ({ name, brand, sku: null, qty, total: t })) });
const purchases = [
  P('2026-10-15T09:50:05+00:00', 'Time Keeper', 75, [['Rivera - Water - Blue', 'DVO - Italia', 1, 75]]),
  P('2026-10-14T17:04:22+00:00', 'Time Keeper - Avenues', 430, [['Mini Red Jasper In Steel - Leather Strap', 'Dennison', 1, 195], ['Mini Lapis Lazuli In Steel - Leather Strap', 'Dennison', 1, 195], ['Dennison - Mini Bark Mesh Bracelet', 'Dennison', 1, 35], ['Dennison - Bark Mesh Bracelet Regular', 'Dennison', 1, 40], ['Discount', null, -1, -35]]),
  P('2026-10-06T09:34:20+00:00', 'Time Keeper', 465.5, [['Oblique Enigma - Steel', 'Dennison', 1, 245], ['Oblique Vector - Gold', 'Dennison', 1, 245], ['Discount', null, -1, -24.5]]),
  P('2026-10-02T11:58:36+00:00', 'Time Keeper - Avenues', 718, [['Mini Aventurine In Gold - Leather Strap', 'Dennison', 1, 195], ['Mini Red Jasper In Gold - Leather Strap', 'Dennison', 1, 195], ['Dennison - Mini Bark Mesh Bracelet', 'Dennison', 1, 35], ['Ballet Musical Jewellery Box', 'Wolf', 1, 210], ['Ballet Musical Jewellery Box', 'Wolf', 1, 210], ['Discount', null, -1, -127]]),
  P('2026-09-17T09:53:36+00:00', 'Time Keeper', 48, [['Neon Jelly - SWASB02K100', 'Swatch', 1, 46], ['Delivery', null, 1, 2]]),
  P('2026-09-02T08:45:03+00:00', 'Time Keeper', 230, [['KT301 (KUBO - USUKI)', 'Kiwame Tokyo', 1, 230]]),
  P('2026-08-29T08:45:16+00:00', 'Time Keeper', 345, [['Dennison Pietersite - Time Keeper Edition - Steel', 'Dennison', 1, 345]]),
  P('2026-08-27T19:31:17+00:00', 'Time Keeper - Avenues', 345, [['Dennison Pietersite - Time Keeper Edition - Gold', 'Dennison', 1, 345]]),
  P('2026-06-28T09:09:06+00:00', 'Time Keeper - Avenues', 27, [['TK - Leather Straps', 'Time Keeper', 1, 27]]),
  P('2026-06-14T05:58:26+00:00', 'Time Keeper', 150, [['Solara - Fire - Orange', 'DVO - Italia', 1, 75], ['Nova - Time - Grey', 'DVO - Italia', 1, 75]]),
  P('2026-04-08T07:49:44+00:00', 'Time Keeper', 92, [['West End - Souq - Black Arabic Numbers', 'West End', 1, 90], ['Delivery', null, 1, 2]]),
  P('2026-04-01T17:02:18+00:00', 'Time Keeper - Avenues', 573.75, [['Aquascaphe MK2 - Grey', 'Baltic', 1, 225], ['Aquascaphe MK2 - Green', 'Baltic', 1, 225], ['Aquascaphe MK2 - Blue', 'Baltic', 1, 225], ['Discount', null, -1, -101.25]]),
  P('2026-01-22T06:57:34+00:00', 'Time Keeper', 1390, [['Projekt 02 - FFF&F Edition', 'Kollokium', 1, 1390]]),
  P('2026-01-21T06:02:23+00:00', 'Time Keeper', 212, [['Hermétique Summer - Pink', 'Baltic', 1, 210], ['Delivery', null, 1, 2]]),
  P('2025-12-05T11:54:22+00:00', 'Time Keeper - Avenues', 1110, [['The Impossible Collection of Watches', 'Assouline', 1, 370], ['Patek Philippe: The Impossible Collection', 'Assouline', 1, 370], ['Rolex: The Impossible Collection', 'Assouline', 1, 370]]),
  P('2025-11-15T06:21:44+00:00', 'Time Keeper', 98, [['Sea Turtle Giant - XS.0321.ARB.1', 'Luminox', 1, 96], ['Delivery', null, 1, 2]]),
  P('2025-09-10T11:18:40+00:00', 'Time Gallery', 50, [['Leather Straps', 'GPF Straps', 1, 50]]),
  P('2025-09-10T11:17:55+00:00', 'Time Gallery', -65, [['Leather Straps', 'GPF Straps', -1, -65]], true),
  P('2025-09-08T11:28:17+00:00', 'Time Gallery', 65, [['Leather Straps', 'GPF Straps', 1, 65]]),
  P('2024-02-01T09:11:55+00:00', 'Time Gallery', 890, [['Heritage Chronograph - Time Keeper Edition', 'Lebois & Co', 1, 890]]),
];
const profile = { customer: { id: uid(2), display_name: `عميل ${ar(2)}`, contact: phone(2), phone_e164: phone(2), is_vip: false, email: null,
  birthday: null, anniversary: null, instagram: null, preferred_brands: [], personal_notes: null, created_at: '2024-02-01T09:11:55+00:00' },
  responsible: null, mine: false, known_by: [], visits: [], purchases, handoffs: [], occasions: [], contact_changes: [] };

const USER = { id: '90ae5d91-0000-4000-8000-000000000001', email: 'owner@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: { provider: 'email' }, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' };
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const exp = Math.floor(Date.now() / 1000) + 86400;
const JWT = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: USER.id, role: 'authenticated', exp, aud: 'authenticated' })}.sig`;
const SESSION = { access_token: JWT, refresh_token: 'r', token_type: 'bearer', expires_in: 86400, expires_at: exp, user: USER };

const unknown = new Set();
function answer(route) {
  const req = route.request();
  const url = new URL(req.url());
  const p = url.pathname;
  const range = req.headers()['range'];
  const json = (body, headers = {}) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range', ...headers }, body: JSON.stringify(body) });
  const paged = (rows) => {
    const [from, to] = (range || `0-${rows.length - 1}`).split('-').map(Number);
    const slice = rows.slice(from, to + 1);
    return json(slice, { 'content-range': `${from}-${from + slice.length - 1}/${rows.length}` });
  };
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
  if (p.startsWith('/auth/v1/user')) return json(USER);
  if (p.startsWith('/auth/v1/token')) return json(SESSION);
  const single = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
  if (p === '/rest/v1/profiles') return json(single ? { id: USER.id, full_name: 'Ali Alramadhan', role: 'admin', sales_name: 'Ali' } : [{ id: USER.id, full_name: 'Ali Alramadhan', role: 'admin', sales_name: 'Ali' }]);
  if (p === '/rest/v1/employees') return json(single ? { dsr_staff_name: 'Ali' } : [{ dsr_staff_name: 'Ali' }]);
  if (p === '/rest/v1/message_templates') return json(templates);
  if (p === '/rest/v1/rpc/customer_list') return paged(listRows);
  if (p === '/rest/v1/rpc/brand_customers') return paged(brandRows);
  if (p === '/rest/v1/rpc/customer_brand_counts') return json(counts);
  if (p === '/rest/v1/rpc/name_skeleton') return json('dnsn');
  if (p === '/rest/v1/rpc/customer_profile') return json(profile);
  if (p === '/rest/v1/rpc/roster_employees') return json([{ employee_id: 'e0000000-0000-4000-8000-000000000001', staff_name: 'Ali' }]);
  if (p === '/rest/v1/rpc/roster_arabic_names') return json([{ staff_name: 'Ali', name_ar: 'علي' }]);
  if (p === '/rest/v1/rpc/log_whatsapp_handoff') return json(1);
  unknown.add(`${req.method()} ${p}`);
  return json(single ? {} : []);
}

async function page(browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 664 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: 'en-GB' });
  await ctx.route(/supabase\.co/, answer);
  await ctx.route(/wa\.me/, r => r.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>WhatsApp</body></html>' }));
  await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); }, [`sb-${REF}-auth-token`, JSON.stringify(SESSION)]);
  // WhatsApp "opens" without leaving the page, as it does on a phone
  await ctx.addInitScript(() => { window.open = () => ({ closed: false, close() {} }); });
  const p = await ctx.newPage();
  p.on('pageerror', e => console.log('page error:', e.message));
  return { ctx, p };
}
const shot = async (p, name) => { await p.waitForTimeout(700); await p.screenshot({ path: OUT + name + '.png' }); console.log('shot', name); };

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const { ctx, p } = await page(browser);
  await p.goto(APP + '/#/crm', { waitUntil: 'networkidle' });
  await p.waitForTimeout(1500);
  await shot(p, '0-customers');
  if (ONLY === 'probe') { console.log('unanswered:', [...unknown].join(' | ')); process.exit(0); }

  // the brand picker
  await p.getByRole('button', { name: /^Brand$/ }).click();
  await shot(p, '1-picker');
  await p.getByRole('button', { name: /Close/ }).click();

  // typing the brand in Arabic in the main search
  await p.getByPlaceholder('Name, number or brand').fill('دنيسون');
  await p.waitForTimeout(900);
  await shot(p, '2-search');

  // the Dennison list
  await p.getByRole('button', { name: /Customers who bought Dennison/ }).click();
  await p.waitForTimeout(1500);
  await shot(p, '3-list');
  await p.evaluate(() => window.scrollTo(0, 240));
  await shot(p, '3b-list-rows');
  await p.evaluate(() => window.scrollTo(0, 0));

  // WhatsApp one by one: the sheet, in Arabic
  await p.getByRole('button', { name: /^Next$/ }).click();
  await p.waitForTimeout(800);
  await p.getByRole('button', { name: 'العربية' }).click();
  await shot(p, '4-sheet');
  await p.getByRole('button', { name: /Open WhatsApp/ }).click();
  await p.waitForTimeout(800);
  await shot(p, '5-sent');

  // a customer's page: the Brands card
  await p.goto(APP + '/#/crm?brand=Dennison&customer=' + uid(2), { waitUntil: 'networkidle' });
  await p.waitForTimeout(1200);
  await p.evaluate(() => { const h = [...document.querySelectorAll('h2')].find(e => e.textContent === 'Brands'); if (h) window.scrollTo(0, h.getBoundingClientRect().top + window.scrollY - 120); });
  await shot(p, '6-profile');

  console.log('unanswered:', [...unknown].join(' | '));
  await browser.close();
})();
