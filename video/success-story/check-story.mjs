#!/usr/bin/env node
/**
 * Accuracy and brand gate for the Time Keeper success-story storyboards.
 *   node check-story.mjs                 audit ep1-ep3, print the report, exit 1 on errors
 *   node check-story.mjs --report        also write LEDGER.md (scene by scene status) and SCRIPT-AR.md (narration)
 *   node check-story.mjs --final         also fail on UNCONFIRMED scenes and missing assets (use before the 1080x1920 master)
 *
 * Rules enforced (from the production brief, sections 17, 18 and 21):
 *  - every scene has a status: CONFIRMED (documented externally, needs a source) | FOUNDER | METAPHOR | UNCONFIRMED
 *  - a scene that names a watch house must classify the relationship (authorized_retailer, collaboration, interview_content,
 *    manufacture_visit, event_access, media_coverage, other_documented) and give evidence
 *  - partnership wording (partner, partnership, official, authorized, شريك, شراكة, رسمي, وكيل) next to a house is allowed only for
 *    authorized_retailer or collaboration WITH evidence
 *  - banners stay short, caption groups stay readable
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const args = new Set(process.argv.slice(2));
const STATUS = ['CONFIRMED', 'FOUNDER', 'METAPHOR', 'UNCONFIRMED'];
const RELATIONS = ['authorized_retailer', 'collaboration', 'interview_content', 'manufacture_visit', 'event_access', 'media_coverage', 'other_documented'];
const STRONG = ['authorized_retailer', 'collaboration'];
const HOUSES = [['Rolex', 'رولكس'], ['Patek', 'باتيك'], ['Audemars', 'اوديمار', 'أوديمار'], ['Hublot', 'هوبلو'], ['Bulgari', 'Bvlgari', 'بلغاري', 'بولغري'],
  ['Tudor', 'تيودور'], ['Gerald Charles', 'جيرالد تشارلز'], ['Omega', 'أوميغا', 'اوميغا'], ['Cartier', 'كارتييه'], ['Vacheron', 'فاشرون'], ['Richard Mille', 'ريتشارد ميل'],
  ['F.P. Journe', 'Journe', 'جورن'], ['Jaeger', 'جيجر'], ['IWC'], ['Panerai', 'بانيراي'], ['Breitling', 'بريتلينغ'], ['Zenith', 'زينيث'], ['Parmigiani', 'بارميجياني']];
const PARTNER = /(partner|partnership|official|authori[sz]ed|exclusive|شريك|شراكة|شركاء|رسمي|وكيل|حصري)/i;
const errors = [], warns = [];
const err = (id, m) => errors.push(`${id}: ${m}`), warn = (id, m) => warns.push(`${id}: ${m}`);
const eps = [];
for (const n of [1, 2, 3]) {
  const f = path.join(here, `ep${n}.json`);
  if (!fs.existsSync(f)) { err(`ep${n}`, 'storyboard missing, run python3 build.py'); continue; }
  eps.push(JSON.parse(fs.readFileSync(f, 'utf8')));
}
const texts = (sc) => {
  const out = [sc.banner && (typeof sc.banner === 'string' ? sc.banner : sc.banner.text), sc.captions, sc.vo];
  (function walk(o) { if (Array.isArray(o)) o.forEach(walk); else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { if (['label', 'text', 'desc', 'title', 'body', 'caption', 'sign'].includes(k) && typeof v === 'string') out.push(v); else walk(v); } })(sc.elements);
  return out.filter(Boolean).join(' | ');
};
const rows = [];
let placeholders = 0;
for (const ep of eps) {
  const dur = ep.scenes.reduce((a, s) => a + s.dur, 0);
  if (dur < 55 || dur > 105) warn(`ep${ep.episode}`, `runs ${dur.toFixed(1)}s (brief target 60-90s; story quality wins, but check pacing)`);
  for (const sc of ep.scenes) {
    const id = sc.id || '?';
    if (!sc.status) err(id, 'no status'); else if (!STATUS.includes(sc.status)) err(id, `unknown status ${sc.status}`);
    if (sc.status === 'CONFIRMED' && !sc.source) err(id, 'CONFIRMED needs a "source" (URL or document name)');
    if (sc.status === 'UNCONFIRMED') (args.has('--final') ? err : warn)(id, 'UNCONFIRMED claim: ' + (sc.claims || []).join(' / '));
    if (!sc.claims || !sc.claims.length) warn(id, 'no claims recorded');
    const t = texts(sc);
    const named = HOUSES.filter((h) => h.some((a) => t.toLowerCase().includes(a.toLowerCase())));
    const brands = sc.brands || [];
    for (const h of named) {
      const b = brands.find((x) => h.some((a) => x.name.toLowerCase().includes(a.toLowerCase())));
      if (!b) { err(id, `names ${h[0]} but has no "brands" entry classifying the relationship`); continue; }
      if (!RELATIONS.includes(b.relation)) err(id, `${h[0]}: relation "${b.relation}" is not one of ${RELATIONS.join(', ')}`);
      if (!b.evidence) err(id, `${h[0]}: relation needs evidence`);
      if (PARTNER.test(t) && !STRONG.includes(b.relation)) err(id, `${h[0]}: partnership wording appears but relation is only ${b.relation}`);
    }
    for (const b of brands) if (b.relation && !RELATIONS.includes(b.relation)) err(id, `unknown relation ${b.relation}`);
    const bt = typeof sc.banner === 'string' ? sc.banner : '';
    if (bt && bt.split(/\s+/).length > 7) warn(id, 'banner is long: ' + bt);
    const ph = JSON.stringify(sc.elements).match(/"asset":"[^"]+"/g) || [];
    const missing = ph.map((a) => a.slice(9, -1)).filter((a) => !['jpg', 'jpeg', 'png', 'webp'].some((e) => fs.existsSync(path.join(here, 'assets', a + '.' + e))));
    placeholders += missing.length;
    rows.push({ ep: ep.episode, id, status: sc.status || 'NONE', dur: sc.dur, vo: sc.vo || '', banner: bt, claims: sc.claims || [], note: sc.note || '', brands, missing });
  }
}
if (args.has('--final') && placeholders) err('assets', `${placeholders} placeholder(s) still need real assets`);

if (args.has('--report')) {
  let L = '# Scene ledger (generated by check-story.mjs, do not edit by hand)\n\nStatus key: **CONFIRMED** documented externally, **FOUNDER** supplied directly by the founders, **METAPHOR** artistic representation, **UNCONFIRMED** held until a founder confirms.\n';
  let A = '# Narration script (generated). Arabic, Kuwaiti dialect, one line per scene\n\nTimings are estimates from word count until narration is recorded.\n';
  for (const ep of eps) {
    L += `\n## Episode ${ep.episode}: ${ep.title}  (${ep.scenes.reduce((a, s) => a + s.dur, 0).toFixed(1)} s)\n\n| Scene | Status | Claims | Real assets still needed | Brand relations |\n| --- | --- | --- | --- | --- |\n`;
    A += `\n## Episode ${ep.episode}: ${ep.title}\n\n`;
    let t = 0;
    for (const r of rows.filter((x) => x.ep === ep.episode)) {
      L += `| ${r.id} | ${r.status} | ${r.claims.join('<br>').replace(/\|/g, '/')} | ${r.missing.join(', ') || '-'} | ${r.brands.map((b) => `${b.name}: ${b.relation}`).join('<br>') || '-'} |\n`;
      A += `- **${r.id}** (${t.toFixed(1)}s, ${r.dur}s)${r.banner ? '  banner: ' + r.banner : ''}\n  ${r.vo || '*no narration, picture and sound only*'}\n`;
      t += r.dur;
    }
  }
  fs.writeFileSync(path.join(here, 'LEDGER.md'), L); fs.writeFileSync(path.join(here, 'SCRIPT-AR.md'), A);
  console.log('wrote LEDGER.md and SCRIPT-AR.md');
}
const count = (s) => rows.filter((r) => r.status === s).length;
console.log(`${rows.length} scenes: ${STATUS.map((s) => s + ' ' + count(s)).join(', ')}; ${placeholders} placeholder asset(s)`);
warns.forEach((w) => console.log('warn  ' + w));
errors.forEach((e) => console.log('ERROR ' + e));
if (errors.length) { console.log(`${errors.length} error(s)`); process.exit(1); }
console.log('accuracy gate: passed');
