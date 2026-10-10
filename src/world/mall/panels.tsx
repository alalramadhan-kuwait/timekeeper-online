import { useMemo, useState } from 'react';
import { Check, Loader2, Search, Star } from 'lucide-react';
import { ClassBar, Head, MissionRows, Note, Row, Section, Stat, type Ctx, type View } from '../panels';
import { OWNERSHIP_LABEL } from '../model';
import { day, kd0, num, plural } from '../format';
import type { Ownership } from '../types';
import { actOnMall, type Look, type MallAction } from './data';
import { SECTIONS, SLOT_GEO } from './layout';
import { displayName, placeLabel, type MallBrand, type MallSpot } from './model';

/* The mall's panels: a brand's full board, a display area, the brand finder, the
   illustrative-shopper note and the owners' settings. Figures come from the World's
   snapshot and world_mall(); changes go through world_mall_act(), owners only. */

type MallView = Extract<View, { type: 'brand' | 'display' | 'section' | 'shopper' | 'brands' | 'mall-settings' | 'move' }>;
const MALL_VIEWS = new Set(['brand', 'display', 'section', 'shopper', 'brands', 'mall-settings', 'move']);
export const isMallView = (v: View): v is MallView => MALL_VIEWS.has(v.type);

export function MallPanelBody({ view, ctx }: { view: MallView; ctx: Ctx }) {
  switch (view.type) {
    case 'brand': return <BrandPanel key={view.brand} name={view.brand} ctx={ctx} />;
    case 'display': return <DisplayPanel slot={view.slot} ctx={ctx} />;
    case 'section': return <SectionPanel index={view.index} ctx={ctx} />;
    case 'shopper': return <ShopperPanel section={view.section} ctx={ctx} />;
    case 'brands': return <BrandSearch ctx={ctx} />;
    case 'mall-settings': return <MallSettings ctx={ctx} />;
    case 'move': return <MovePanel key={view.brand} name={view.brand} ctx={ctx} />;
  }
}

const spotOf = (ctx: Ctx, brand: string) => ctx.mall.spots.find((sp) => sp.brand.brand === brand) ?? null;
const OWN_ORDER: Ownership[] = ['owned', 'consignment', 'pre_owned', 'unknown'];
const OWN_COLOUR: Record<Ownership, string> = { owned: '#9b6a43', consignment: '#7a5a96', pre_owned: '#3f8f8a', unknown: '#9aa0a6' };

function useAct(ctx: Ctx) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = async (a: MallAction) => {
    setBusy(true); setErr(null);
    try { await actOnMall(a); await ctx.refresh(); return true; }
    catch (e) { setErr((e as Error).message); return false; }
    finally { setBusy(false); }
  };
  return { busy, err, run };
}

function OwnershipSplit({ b }: { b: MallBrand }) {
  const total = OWN_ORDER.reduce((n, o) => n + (b.ownership[o]?.cost ?? 0), 0) || 1;
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full bg-slate-100">
        {OWN_ORDER.map((o) => (b.ownership[o]?.cost ?? 0) > 0
          ? <div key={o} style={{ width: `${((b.ownership[o]!.cost) / total) * 100}%`, background: OWN_COLOUR[o] }} /> : null)}
      </div>
    </div>
  );
}

/* ── a brand ──────────────────────────────────────────────────────────── */

function BrandPanel({ name, ctx }: { name: string; ctx: Ctx }) {
  const b = ctx.mall.byName.get(name);
  const sp = spotOf(ctx, name);
  const { busy, err, run } = useAct(ctx);
  if (!b) return <p className="text-sm text-slate-500">This brand is no longer in the mall.</p>;
  const sugg = ctx.mall.suggestions.filter((x) => x.brand === name);
  const boutique = sp?.slot.kind === 'boutique';
  return (
    <div>
      <Head title={b.brand} sub={placeLabel(sp)} />
      <div className="mt-2 flex flex-wrap gap-1.5">
        {b.featured && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-900">★ Featured</span>}
        {!b.inStock && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">No stock now</span>}
        {b.place?.how === 'new_brand' && <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] text-sky-800">New: placed automatically</span>}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Stat label="Units" value={num(b.units)} sub={plural(b.products, 'product')} />
        <Stat label="At cost" value={kd0(b.cost)} sub={`${kd0(b.retail)} at retail`} />
        <Stat label="Sold yesterday" value={num(b.soldYesterday)} sub={`units, ${day(ctx.mall.soldDay)}`} />
        <Stat label="Sold in 30 days" value={num(b.sold30)} sub="units" />
      </div>
      <Section title="How it's selling (stock at cost)"><ClassBar shelf={b} /></Section>
      <Section title="Owned and consignment (at cost)">
        <OwnershipSplit b={b} />
        <div className="mt-2">
          {OWN_ORDER.filter((o) => b.ownership[o]).map((o) => (
            <Row key={o} onClick={() => ctx.open({ type: 'case', id: `${b.brand}|${o}` })}>
              <div className="flex items-baseline gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: OWN_COLOUR[o] }} />
                <span className="font-medium text-slate-800">{OWNERSHIP_LABEL[o]}</span>
                <span className="ml-auto text-xs tabular-nums text-slate-600">{plural(b.ownership[o]!.units, 'unit')} · {kd0(b.ownership[o]!.cost)}</span>
              </div>
            </Row>
          ))}
        </div>
      </Section>
      <Section title={`Open purchase orders (${b.openPos.length})`}>
        {b.openPos.length === 0 ? <p className="text-sm text-slate-500">None open for this brand.</p> : b.openPos.map((po) => (
          <Row key={po.po_id} onClick={() => ctx.open({ type: 'po', id: po.po_id })}>
            <div className="flex items-baseline gap-2">
              <span className="font-medium text-slate-800">{po.po_number}</span>
              <span className="ml-auto text-xs tabular-nums text-slate-600">{num(po.outstanding_units)} units to come</span>
            </div>
            <div className="text-xs text-slate-500">{po.supplier} · {po.status} · {day(po.created_date)}</div>
          </Row>
        ))}
      </Section>
      {b.missions.length > 0 && <Section title="Missions"><MissionRows missions={b.missions} ctx={ctx} /></Section>}
      {sugg.length > 0 && (
        <Section title="For the owners">
          {sugg.map((x) => <Note key={x.kind + x.reason}>{suggestionText(x.kind, x.reason, x.days, ctx.mall.threshold)}</Note>)}
        </Section>
      )}
      <Section title="Owners">
        <div className="flex flex-wrap gap-2">
          <button disabled={busy} onClick={() => run({ action: 'feature', brand: b.brand, on: !b.featured })}
            className="flex items-center gap-1.5 rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50">
            <Star size={15} className={b.featured ? 'fill-amber-400 text-amber-500' : ''} />{b.featured ? 'Stop featuring' : 'Feature this brand'}
          </button>
          <button onClick={() => ctx.open({ type: 'move', brand: b.brand })}
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700">Change its place…</button>
          {boutique && (
            <label className="flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-700">
              Boutique colour
              <input id={`colour-${b.brand}`} type="color" defaultValue={b.colour ?? '#22304d'} disabled={busy}
                onChange={(e) => run({ action: 'colour', brand: b.brand, colour: e.target.value })} className="h-6 w-8 border-0 bg-transparent p-0" />
            </label>
          )}
        </div>
        {err && <div className="mt-2"><Note tone="warn">{err}</Note></div>}
        <p className="mt-2 text-xs text-slate-500">Places never change by themselves. A brand moves only when an owner moves it here.</p>
      </Section>
    </div>
  );
}

function suggestionText(kind: string, reason: string, days: number | null, threshold: number) {
  if (kind === 'promote' && reason === 'featured') return 'Featured, so suggested for a boutique. It stays where it is until an owner moves it.';
  if (kind === 'promote') return `At or above ${kd0(threshold)} every day for ${days} days: ready for a boutique, when an owner decides.`;
  if (kind === 'free') return `No stock for ${days} days. Its kiosk could be freed; the brand stays searchable either way.`;
  return days === null ? `Below ${kd0(threshold)} since the history began. It keeps its boutique.` : `Below ${kd0(threshold)} for ${days} days. It keeps its boutique.`;
}

/* ── a display area ───────────────────────────────────────────────────── */

function DisplayPanel({ slot, ctx }: { slot: string; ctx: Ctx }) {
  const g = SLOT_GEO[slot];
  const spots = ctx.mall.spots.filter((sp) => sp.slot.slot === slot).sort((a, b) => a.position - b.position);
  return (
    <div>
      <Head title={displayName(slot)} sub={`${SECTIONS[g.section].name} · ${g.kind === 'island' ? 'walkway island' : 'display area'}`} />
      <div className="mt-3">{spots.map((sp) => <BrandRow key={sp.brand.brand} sp={sp} ctx={ctx} />)}</div>
    </div>
  );
}

function BrandRow({ sp, ctx }: { sp: MallSpot; ctx: Ctx }) {
  const b = sp.brand;
  return (
    <Row onClick={() => { ctx.focusBrand(b.brand); ctx.open({ type: 'brand', brand: b.brand }); }}>
      <div className="flex items-baseline gap-2">
        <span className="truncate font-medium text-slate-800">{b.brand}</span>
        {b.missions.length > 0 && <span className="rounded-full bg-amber-100 px-1.5 text-[10px] text-amber-900">!</span>}
        <span className="ml-auto text-xs tabular-nums text-slate-600">{kd0(b.cost)}</span>
      </div>
      <div className="text-xs tabular-nums text-slate-500">{plural(b.units, 'unit')}{b.openPos.length ? ` · ${plural(b.openPos.length, 'open PO')}` : ''}</div>
    </Row>
  );
}

function SectionPanel({ index, ctx }: { index: number; ctx: Ctx }) {
  const spots = ctx.mall.spots.filter((sp) => sp.slot.section === index);
  return (
    <div>
      <Head title={SECTIONS[index].name} sub={`${plural(spots.length, 'brand')} · ${kd0(spots.reduce((n, sp) => n + sp.brand.cost, 0))} at cost`} />
      <div className="mt-3">{spots.map((sp) => <BrandRow key={sp.brand.brand} sp={sp} ctx={ctx} />)}</div>
    </div>
  );
}

function ShopperPanel({ section, ctx }: { section: number; ctx: Ctx }) {
  const units = ctx.mall.spots.filter((sp) => sp.slot.section === section).reduce((n, sp) => n + Math.max(0, sp.brand.sold30), 0);
  return (
    <div>
      <Head title="Illustrative shopper" sub={SECTIONS[section].name} />
      <p className="mt-3 text-sm text-slate-700">Shoppers here are an illustration, not live visitors. Nothing counts people coming in.</p>
      <p className="mt-2 text-sm text-slate-700">How many walk in each section follows its brands' units sold in the last 30 days: <b>{num(units)}</b> here.</p>
    </div>
  );
}

/* ── finding a brand ──────────────────────────────────────────────────── */

function BrandSearch({ ctx }: { ctx: Ctx }) {
  const [q, setQ] = useState('');
  const [f, setF] = useState<'all' | 'boutiques' | 'missions' | 'orders' | 'featured'>('all');
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return ctx.mall.brands.filter((b) => !t || b.brand.toLowerCase().includes(t)).filter((b) => {
      const sp = spotOf(ctx, b.brand);
      if (f === 'boutiques') return sp?.slot.kind === 'boutique';
      if (f === 'missions') return b.missions.length > 0;
      if (f === 'orders') return b.openPos.length > 0;
      if (f === 'featured') return b.featured;
      return true;
    });
  }, [q, f, ctx]);
  return (
    <div>
      <Head title="Find a brand" sub={`All ${ctx.mall.brands.length} brands in the mall`} />
      <label className="mt-3 flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2">
        <Search size={16} className="text-slate-400" />
        <input id="mall-brand-search" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Brand name…" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
      </label>
      <div className="mt-2 flex flex-wrap gap-1">
        {([['all', 'All'], ['boutiques', 'Boutiques'], ['missions', 'Missions'], ['orders', 'Open POs'], ['featured', 'Featured']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setF(k)} className={`rounded-full border px-2.5 py-1 text-[11px] ${f === k ? 'border-[#22304d] bg-[#22304d] text-white' : 'border-slate-200 text-slate-600'}`}>{l}</button>
        ))}
      </div>
      <p className="mt-2 text-xs text-slate-500">{plural(rows.length, 'brand')}</p>
      <div>
        {rows.map((b) => {
          const sp = spotOf(ctx, b.brand);
          return (
            <Row key={b.brand} onClick={() => { if (sp) ctx.focusBrand(b.brand); ctx.open({ type: 'brand', brand: b.brand }); }}>
              <div className="flex items-baseline gap-2">
                <span className="truncate font-medium text-slate-800">{b.brand}</span>
                {b.featured && <Star size={12} className="shrink-0 fill-amber-400 text-amber-500" />}
                <span className="ml-auto shrink-0 text-xs tabular-nums text-slate-600">{kd0(b.cost)}</span>
              </div>
              <div className="truncate text-xs text-slate-500">{placeLabel(sp)} · {plural(b.units, 'unit')}</div>
            </Row>
          );
        })}
      </div>
    </div>
  );
}

/* ── changing a place ─────────────────────────────────────────────────── */

function MovePanel({ name, ctx }: { name: string; ctx: Ctx }) {
  const { busy, err, run } = useAct(ctx);
  const [pick, setPick] = useState<{ slot: string; position: number } | null>(null);
  const [done, setDone] = useState(false);
  const from = spotOf(ctx, name);
  const occupant = (slot: string, position: number) => ctx.mall.spots.find((sp) => sp.slot.slot === slot && sp.position === position) ?? null;
  const target = pick ? occupant(pick.slot, pick.position) : null;
  const confirm = async () => {
    if (!pick) return;
    const moves = [{ brand: name, slot: pick.slot, position: pick.position }];
    if (target && from) moves.push({ brand: target.brand.brand, slot: from.slot.slot, position: from.position });
    if (await run({ action: 'move', moves, reason: target ? `swapped with ${target.brand.brand}` : undefined })) setDone(true);
  };
  if (done) return (
    <div>
      <Head title="Moved" sub={name} />
      <p className="mt-3 flex items-center gap-2 text-sm text-slate-700"><Check size={16} className="text-emerald-600" /> The new place is saved and recorded with your name.</p>
    </div>
  );
  return (
    <div>
      <Head title={`Move ${name}`} sub={`Now: ${placeLabel(from)}`} />
      <p className="mt-2 text-xs text-slate-500">Pick a place. An empty one moves the brand; a taken one swaps the two brands. Nothing changes until you confirm.</p>
      {SECTIONS.map((sec, si) => (
        <Section key={sec.key} title={sec.name}>
          <div className="flex flex-col gap-1.5">
            {Object.values(SLOT_GEO).filter((g) => g.section === si).map((g) => {
              const cap = g.kind === 'boutique' ? 1 : 4;
              return (
                <div key={g.slot} className="rounded-xl border border-slate-200 p-2">
                  <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{g.kind === 'boutique' ? 'Boutique' : displayName(g.slot)}{g.kind === 'island' ? ' · island' : ''}</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {Array.from({ length: cap }, (_, p) => {
                      const o = occupant(g.slot, p);
                      const here = o?.brand.brand === name;
                      const chosen = pick?.slot === g.slot && pick.position === p;
                      return (
                        <button key={p} disabled={here} onClick={() => setPick({ slot: g.slot, position: p })}
                          className={`rounded-lg border px-2 py-1 text-xs ${chosen ? 'border-[#22304d] bg-[#22304d] text-white' : here ? 'border-amber-300 bg-amber-50 text-amber-900' : o ? 'border-slate-200 text-slate-700' : 'border-dashed border-slate-300 text-slate-400'}`}>
                          {o ? o.brand.brand : 'Empty'}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </Section>
      ))}
      {pick && (
        <div className="sticky bottom-0 mt-4 rounded-2xl bg-white p-3 shadow-lg ring-1 ring-slate-200">
          <p className="text-sm text-slate-700">{target ? <>Swap <b>{name}</b> with <b>{target.brand.brand}</b>.</> : <>Move <b>{name}</b> to {SLOT_GEO[pick.slot].kind === 'boutique' ? 'this boutique' : `${displayName(pick.slot)}, kiosk ${pick.position + 1}`}.</>}</p>
          <button disabled={busy} onClick={confirm} className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-[#22304d] py-2 text-sm font-medium text-white disabled:opacity-60">
            {busy && <Loader2 size={15} className="animate-spin" />} Confirm
          </button>
          {err && <div className="mt-2"><Note tone="warn">{err}</Note></div>}
        </div>
      )}
    </div>
  );
}

/* ── the owners' settings ─────────────────────────────────────────────── */

const LOOKS: [Look, string][] = [['neutral', 'Not set (neutral)'], ['man', 'Man'], ['woman', 'Woman'], ['woman_hijab', 'Woman, hijab']];

function MallSettings({ ctx }: { ctx: Ctx }) {
  const set = ctx.mall.data.settings;
  const { busy, err, run } = useAct(ctx);
  const [threshold, setThreshold] = useState(String(set.boutique_threshold_kd));
  const [promote, setPromote] = useState(String(set.promote_after_days));
  const [free, setFree] = useState(String(set.free_after_days));
  const h = ctx.mall.data.history;
  const sugg = ctx.mall.suggestions.filter((x) => x.kind !== 'below');
  const below = ctx.mall.suggestions.filter((x) => x.kind === 'below');
  const dutyText = (s: typeof ctx.mall.staff[number]) => s.duty.state === 'on' ? 'On duty' : s.duty.state === 'unclosed' ? 'No clock-out yet' : 'Not on duty';
  return (
    <div>
      <Head title="Mall settings" sub="Owners only. Every change is recorded with your name." />
      <Section title="Boutique rule">
        <div className="grid grid-cols-3 gap-2 text-xs">
          <label className="flex flex-col gap-1 text-slate-600">Threshold (KD at cost)
            <input id="mall-threshold" inputMode="numeric" value={threshold} onChange={(e) => setThreshold(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-800" /></label>
          <label className="flex flex-col gap-1 text-slate-600">Days above it before suggesting a boutique
            <input id="mall-promote-days" inputMode="numeric" value={promote} onChange={(e) => setPromote(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-800" /></label>
          <label className="flex flex-col gap-1 text-slate-600">Days with no stock before suggesting a kiosk is freed
            <input id="mall-free-days" inputMode="numeric" value={free} onChange={(e) => setFree(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-800" /></label>
        </div>
        <button disabled={busy} onClick={() => run({ action: 'settings', boutique_threshold_kd: Number(threshold), promote_after_days: Number(promote), free_after_days: Number(free) })}
          className="mt-2 rounded-xl bg-[#22304d] px-3 py-2 text-sm font-medium text-white disabled:opacity-60">Save</button>
        <p className="mt-2 text-xs text-slate-500">Changing these never moves a brand; it changes what is suggested. Daily values recorded: {num(h.days)}{h.first_day ? ` (since ${day(h.first_day)})` : ''}.</p>
      </Section>
      <Section title="Suggestions">
        {sugg.length === 0 ? <p className="text-sm text-slate-500">Nothing to suggest yet.{h.days < set.promote_after_days ? ` The ${set.promote_after_days}-day rule needs ${set.promote_after_days} days of history.` : ''}</p>
          : sugg.map((x) => (
            <Row key={x.kind + x.brand} onClick={() => ctx.open({ type: 'brand', brand: x.brand })}>
              <div className="font-medium text-slate-800">{x.brand}</div>
              <div className="text-xs text-slate-500">{suggestionText(x.kind, x.reason, x.days, ctx.mall.threshold)}</div>
            </Row>
          ))}
        {below.length > 0 && <p className="mt-2 text-xs text-slate-500">Below the threshold but keeping their boutiques: {below.map((x) => x.brand).join(', ')}.</p>}
      </Section>
      <Section title="Featured brands">
        {ctx.mall.data.featured.length === 0 ? <p className="text-sm text-slate-500">None. Feature a brand from its board.</p>
          : ctx.mall.data.featured.map((f) => <Row key={f.brand} onClick={() => ctx.open({ type: 'brand', brand: f.brand })}><span className="font-medium text-slate-800">{f.brand}</span> <span className="text-xs text-slate-500">· by {f.by}, {day(f.at)}</span></Row>)}
      </Section>
      {ctx.mall.unplaced.length > 0 && (
        <Section title="Needs a place">
          {ctx.mall.unplaced.map((b) => <Row key={b.brand} onClick={() => ctx.open({ type: 'move', brand: b.brand })}><span className="font-medium text-slate-800">{b.brand}</span></Row>)}
        </Section>
      )}
      <Section title="Staff looks">
        <p className="mb-2 text-xs text-slate-500">Choose how each person appears. Until an owner chooses, everyone is a neutral figure; nothing is guessed from names. Only people the attendance records show on duty walk in the World.</p>
        {ctx.mall.staff.map((s) => (
          <div key={s.employee_id} className="flex items-center gap-2 border-b border-slate-100 py-2 last:border-0">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-slate-800">{s.name}</div>
              <div className="truncate text-xs text-slate-500">{s.role ?? '—'} · {s.location ?? '—'} · {dutyText(s)}</div>
            </div>
            <select id={`look-${s.employee_id}`} aria-label={`Look for ${s.name}`} value={s.look} disabled={busy}
              onChange={(e) => run({ action: 'look', employee_id: s.employee_id, look: e.target.value as Look })}
              className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700">
              {LOOKS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
        ))}
      </Section>
      {err && <div className="mt-3"><Note tone="warn">{err}</Note></div>}
    </div>
  );
}
