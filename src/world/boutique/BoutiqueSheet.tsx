import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Archive, ArrowDownUp, ArrowLeft, BookmarkPlus, Check, ChevronRight, Loader2, PackageOpen, Truck, Watch as WatchIcon } from 'lucide-react';
import { day, kd, num, when } from '../format';
import { BRAND_LOGOS } from '../assets/brandLogos';
import {
  CLASS_COLOUR, CLASS_WORD, LENSES, SORTS, SOURCE_BADGE, archiveDiscovery, loadDesk, matches, saveDiscovery, shelfOf, sortWatches, tidyName,
  type BoutiqueData, type Discovery, type Lens, type SortKey, type Watch,
} from './data';

/* The boutique's screens: a watch, the catalogue of all its watches, and the Manager's Desk.
   Every figure is the Stock Analyst's or the order ledger's own, as world_boutique() returns it;
   the screen only words it. Cost is shown because the World is the owners' alone. */

const OUTLET: Record<string, string> = { 'Time Keeper - Avenues': 'Avenues', 'Time Keeper': 'Time Keeper', 'Time Gallery': 'Time Gallery' };
const SOLD_OUT = '#c8473b';
const units = (n: number) => `${num(n)} ${Math.abs(n) === 1 ? 'unit' : 'units'}`;

export function Photo({ w, size, big = false }: { w: Watch; size: number; big?: boolean }) {
  const [failed, setFailed] = useState(false);
  const soldOut = shelfOf(w) !== 'in_stock';
  const badge = w.image ? SOURCE_BADGE[w.image.source] : null;
  return (
    <div className="relative grid shrink-0 place-items-center overflow-hidden rounded-xl bg-white ring-1 ring-[#eadfca]" style={{ width: size, height: size }}>
      {w.image && !failed ? (
        <img src={big ? w.image.view : w.image.thumb} alt={w.name} loading="lazy" decoding="async" onError={() => setFailed(true)}
          className={`h-full w-full object-contain ${soldOut && !big ? 'opacity-40' : ''}`} />
      ) : (
        // no verified photo: say so, never stand a drawing in for the watch
        <div className="px-2 text-center text-[10px] leading-tight text-[#8a7a62]">No photo yet</div>
      )}
      {badge && w.image && !failed && <span className="absolute left-1 top-1 rounded bg-white/90 px-1 text-[9px] font-medium text-slate-600 ring-1 ring-slate-200">{badge}</span>}
    </div>
  );
}

function ClassPill({ w }: { w: Watch }) {
  const shelf = shelfOf(w);
  const word = shelf === 'in_stock' ? CLASS_WORD[w.class] ?? w.class : shelf === 'on_order' ? 'Sold out · on order' : 'Sold out';
  const colour = shelf === 'in_stock' ? CLASS_COLOUR[w.class] : SOLD_OUT;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#f6f1e7] px-2.5 py-1 text-xs font-semibold text-[#22304d]">
      <span className="h-2.5 w-2.5 rounded-full ring-1 ring-[#8f8a80]" style={{ background: colour }} />{word}
    </span>
  );
}

function Figure({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl bg-[#f6f1e7] px-2 py-2 text-center">
      <div className="text-lg font-semibold tabular-nums text-[#22304d]">{value}</div>
      <div className="text-[10.5px] text-[#7b6a55]">{label}</div>
    </div>
  );
}

function Line({ k, v }: { k: React.ReactNode; v: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 py-2 text-sm last:border-0">
      <span className="text-slate-500">{k}</span><span className="text-right tabular-nums text-slate-800">{v}</span>
    </div>
  );
}

/* ── one watch ──────────────────────────────────────────────────────────── */

export function WatchPanel({ w, onDock, onSeeInRoom, inRoom, photo = true }: {
  w: Watch; onDock: (poId: string) => void; onSeeInRoom?: () => void; inRoom: boolean; photo?: boolean;
}) {
  const [saving, setSaving] = useState<'closed' | 'open' | 'busy' | 'done'>('closed');
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const outlets = Object.entries(w.by_outlet ?? {}).filter(([, n]) => n !== 0);
  const negative = outlets.filter(([, n]) => n < 0);
  const lines = w.open_pos.filter((p) => p.outstanding > 0 || p.status === 'Partially Received');
  const save = async () => {
    setSaving('busy'); setErr(null);
    try { await saveDiscovery(w.product_id, note.trim() || null); setSaving('done'); }
    catch (e) { setErr((e as Error).message); setSaving('open'); }
  };
  return (
    <div>
      {photo && <div className="mb-3 flex justify-center"><Photo w={w} size={220} big /></div>}
      <h2 className="text-lg font-semibold leading-snug text-[#22304d]" style={{ textWrap: 'balance' } as React.CSSProperties}>{w.name}</h2>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <ClassPill w={w} />
        {w.ownership !== 'owned' && <span className="text-xs text-slate-500">{w.ownership === 'consignment' ? 'Consignment' : w.ownership === 'pre_owned' ? 'Pre-owned' : ''}</span>}
      </div>
      {shelfOf(w) === 'in_stock' && <p className="mt-1 text-xs text-slate-500">{w.class_basis}</p>}

      <div className="mt-3 grid grid-cols-3 gap-2">
        <Figure value={num(w.on_hand)} label="in stock" />
        <Figure value={num(w.u90)} label="sold in 90 days" />
        <Figure value={w.cover_months === null ? '—' : String(w.cover_months)} label="months of cover" />
      </div>

      <div className="mt-3">
        <Line k="Where" v={outlets.length ? outlets.map(([o, n]) => `${OUTLET[o] ?? o} ${n}`).join(' · ') : 'none in any shop'} />
        {negative.length > 0 && <p className="-mt-1 pb-1 text-xs text-amber-800">Lightspeed shows {negative.map(([o, n]) => `${n} at ${OUTLET[o] ?? o}`).join(', ')}: sold before the stock arrived. Shown as Lightspeed records it.</p>}
        <Line k="Sold 30 / 90 / 365 days" v={`${num(w.u30)} / ${num(w.u90)} / ${num(w.u365)}`} />
        <Line k="Last sale" v={w.last_sale ? day(w.last_sale) : 'never'} />
        <Line k="Price" v={kd(w.price, 0)} />
        <Line k={<>Cost <span className="ml-1 rounded bg-amber-50 px-1 text-[10px] text-amber-800">owners</span></>} v={kd(w.cost, 3)} />
        {w.shelf_days !== null && w.on_hand > 0 && <Line k="On the shelf" v={`about ${num(w.shelf_days)} days (estimated)`} />}
      </div>

      <section className="mt-4">
        <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#7b6a55]">On order</h3>
        {lines.length === 0 ? <p className="text-sm text-slate-500">No open order for this watch.</p> : lines.map((p) => (
          <div key={p.po_id} className="mb-2 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
            <div className="flex items-baseline gap-2">
              <Truck size={15} className="shrink-0 self-center text-amber-700" />
              <span className="font-semibold text-[#22304d]">{p.po_number}</span>
              <span className="text-xs text-slate-600">{p.status}</span>
            </div>
            <div className="mt-1 text-sm text-slate-700">This watch: ordered {num(p.ordered)} · received {num(p.received)} · <b>{units(p.outstanding)} to come</b></div>
            <div className="mt-0.5 text-xs text-slate-500">
              {p.expected_owners ? `Owners' expected date ${day(p.expected_owners)}` : "Owners' expected date not set"} · {p.due_lightspeed ? `Lightspeed due ${day(p.due_lightspeed)}` : 'no Lightspeed due date'}
            </div>
            <button onClick={() => onDock(p.po_id)} className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-[#22304d]">
              Open {p.po_number} at the Loading Dock <ChevronRight size={15} />
            </button>
          </div>
        ))}
      </section>

      <section className="mt-4" id={`desk-${w.product_id}`}>
        {saving === 'done' ? (
          <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2.5 text-sm text-emerald-900"><Check size={16} /> On the Manager's Desk, with today's figures.</div>
        ) : saving === 'closed' ? (
          <button onClick={() => setSaving('open')} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#22304d] px-3 py-3 text-sm font-semibold text-white">
            <BookmarkPlus size={17} /> Add to Manager's Desk
          </button>
        ) : (
          <div className="rounded-xl border border-slate-200 p-3">
            <label className="text-xs text-slate-500" htmlFor="desk-note">What did you notice? (optional)</label>
            <textarea id="desk-note" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} rows={3}
              className="mt-1 w-full resize-none rounded-lg border border-slate-300 px-2.5 py-2 text-sm" placeholder="e.g. sells out every month; ask about more" />
            <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400"><span>Today's figures are saved with it.</span><span>{note.length}/300</span></div>
            {err && <p className="mt-1 text-xs text-rose-700">{err}</p>}
            <div className="mt-2 flex gap-2">
              <button onClick={() => setSaving('closed')} className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-700">Cancel</button>
              <button disabled={saving === 'busy'} onClick={save} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#22304d] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">
                {saving === 'busy' && <Loader2 size={15} className="animate-spin" />} Save to desk
              </button>
            </div>
          </div>
        )}
        {!inRoom && onSeeInRoom && (
          <button onClick={onSeeInRoom} className="mt-2 w-full rounded-xl px-3 py-2 text-sm font-medium text-[#22304d] underline-offset-2 hover:underline">See it in the boutique</button>
        )}
      </section>
    </div>
  );
}

/* ── the catalogue: every watch in the boutique, opened from the Collection Board ── */

/* The catalogue and a watch opened from it are drawn as part of the boutique, not as a web page:
   the board's walnut and brass around them, the brand's own logo on its plate, the World's header. */
const WOOD = 'radial-gradient(130% 55% at 50% 0%, #5a3a24 0%, #2a1a10 55%, #160e09 100%)';
const BRASS = 'linear-gradient(180deg, #e2bd6a 0%, #9a7029 45%, #d2a24c 100%)';

function GameHeader({ title, sub, onBack, label }: { title: string; sub?: string; onBack: () => void; label: string }) {
  return (
    <div className="flex items-center gap-2 px-3" style={{ paddingTop: 'calc(0.6rem + env(safe-area-inset-top, 0px))' }}>
      <button onClick={onBack} aria-label={label} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#22304d] text-white shadow-lg"><ArrowLeft size={18} /></button>
      <div className="min-w-0 rounded-2xl bg-[#22304d]/95 px-3.5 py-1.5 text-white shadow-lg">
        <div className="truncate text-[15px] font-semibold tracking-tight">{title}</div>
        {sub && <div className="truncate text-[11px] text-slate-300">{sub}</div>}
      </div>
    </div>
  );
}

function BrandPlate({ brand }: { brand: string }) {
  const logo = BRAND_LOGOS[brand];
  return (
    <div className="mx-auto flex h-11 w-[78%] max-w-[300px] items-center justify-center rounded-md px-4"
      style={{ background: logo?.plate === 'light' ? '#f6efe0' : '#0f1830', boxShadow: '0 0 0 2px #c79b4a, 0 3px 8px rgba(0,0,0,.4)' }}>
      {logo ? <img src={logo.url} alt={brand} className="max-h-[20px] max-w-full" /> : <span className="font-serif text-lg tracking-[0.2em] text-[#f3e7cf]">{brand.toUpperCase()}</span>}
    </div>
  );
}

/* A filter chip in the class's own colour, as on the board. */
const CHIP: Record<string, string> = { fast: '#3f8f5a', healthy: '#5b9bd5', new: '#7b61c9', slow: '#d9a441', dead: '#8f8a80', sold_out: SOLD_OUT, on_order: '#b8742a' };

/* A watch's picture: Lightspeed's 350-pixel image (never the full-size original), fetched only as
   it scrolls near and set on a cream cushion (its white ground melts into it); a quiet placeholder
   where there is no verified photo. */
function Cushion({ w }: { w: Watch }) {
  const [failed, setFailed] = useState(false);
  const soldOut = w.on_hand <= 0;
  return (
    <div className="relative grid aspect-square w-full place-items-center overflow-hidden rounded-xl bg-[#f3ece0]"
      style={{ boxShadow: 'inset 0 2px 6px rgba(90,60,30,.18)' }}>
      {w.image && !failed ? (
        <img src={w.image.view} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} width={350} height={350}
          className={`h-full w-full object-contain p-1.5 mix-blend-multiply ${soldOut ? 'opacity-50 grayscale-[40%]' : ''}`} />
      ) : (
        <div className="flex flex-col items-center gap-1 text-[#a39784]"><WatchIcon size={30} strokeWidth={1.3} /><span className="text-[10px]">No photo yet</span></div>
      )}
      {w.image && !failed && SOURCE_BADGE[w.image.source] && <span className="absolute left-1.5 top-1.5 rounded bg-white/90 px-1 text-[9px] font-medium text-slate-600">{SOURCE_BADGE[w.image.source]}</span>}
    </div>
  );
}

function Status({ w }: { w: Watch }) {
  const inStock = w.on_hand > 0;
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#3d3a35]">
      <span className="h-2 w-2 rounded-full" style={{ background: inStock ? CLASS_COLOUR[w.class] : SOLD_OUT }} />
      {inStock ? CLASS_WORD[w.class] ?? '—' : 'Sold out'}
    </span>
  );
}

export function Catalogue({ data, lens, onLens, sort, onSort, scrollRef, onOpen, onClose }: {
  data: BoutiqueData; lens: Lens; onLens: (l: Lens) => void; sort: SortKey; onSort: (s: SortKey) => void;
  scrollRef: React.MutableRefObject<number>; onOpen: (id: string) => void; onClose: () => void;
}) {
  const list = useMemo(() => sortWatches(data.products.filter((w) => matches(w, lens)), sort), [data, lens, sort]);
  const counts = useMemo(() => Object.fromEntries(LENSES.map((l) => [l.key, data.products.filter((w) => matches(w, l.key)).length])), [data]);
  const body = useRef<HTMLDivElement>(null);
  // back where the owner left it: after a watch, or a step out to the dock and in again
  useLayoutEffect(() => { if (body.current) body.current.scrollTop = scrollRef.current; }, [scrollRef]);
  const pick = (f: () => void) => { f(); if (body.current) body.current.scrollTop = 0; scrollRef.current = 0; };
  return (
    <div className="absolute inset-0 z-50 flex flex-col" style={{ background: WOOD }} role="dialog" aria-label={`${data.brand} collection`}>
      <GameHeader title={`${data.brand} boutique`} sub={`The collection · ${num(list.length)} of ${num(data.products.length)} watches`} onBack={onClose} label="Back to the boutique" />
      {/* the board: brass edge, walnut frame, the brand's plate, then the watches on cream */}
      <div className="mx-2.5 mt-2.5 flex min-h-0 flex-1 flex-col rounded-[20px] p-[3px]" style={{ background: BRASS, marginBottom: 'calc(0.6rem + env(safe-area-inset-bottom, 0px))' }}>
        <div className="flex min-h-0 flex-1 flex-col rounded-[17px] bg-[#3a2516] p-2 shadow-[inset_0_2px_10px_rgba(0,0,0,.5)]">
          <div className="pb-2.5 pt-1"><BrandPlate brand={data.brand} /></div>
          <div className="flex min-h-0 flex-1 flex-col rounded-[13px] bg-[#efe5d1]" style={{ boxShadow: 'inset 0 0 0 1px #c79b4a' }}>
            <div className="shrink-0 px-2 pt-2">
              <div className="-mx-2 flex gap-1.5 overflow-x-auto px-2 pb-1 [scrollbar-width:none]" role="toolbar" aria-label="Filter">
                {LENSES.map((l) => {
                  const on = lens === l.key, c = CHIP[l.key];
                  return (
                    <button key={l.key} onClick={() => pick(() => onLens(l.key))} aria-pressed={on} disabled={counts[l.key] === 0 && !on}
                      className="shrink-0 rounded-full px-2.5 py-1.5 text-[12px] font-semibold disabled:opacity-35"
                      style={on ? { background: '#22304d', color: '#fff' } : { background: c ? `${c}24` : '#fbf6ea', color: c ?? '#22304d', boxShadow: `inset 0 0 0 1px ${c ? `${c}55` : '#dccdb0'}` }}>
                      {l.label} <span className="tabular-nums opacity-75">{counts[l.key]}</span>
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center justify-end gap-1 pb-1.5 text-[11.5px] text-[#6d5a43]">
                <ArrowDownUp size={12} />
                <select value={sort} onChange={(e) => pick(() => onSort(e.target.value as SortKey))} aria-label="Sort"
                  className="appearance-none rounded-md bg-transparent pr-1 font-semibold text-[#4a3a26] outline-none">
                  {SORTS.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
                </select>
              </div>
            </div>
            <div ref={body} onScroll={(e) => { scrollRef.current = e.currentTarget.scrollTop; }} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-3">
              <div className="grid grid-cols-2 gap-2">
                {list.map((w) => (
                  <button key={w.product_id} onClick={() => onOpen(w.product_id)}
                    className="rounded-xl bg-[#fbf6ea] p-1.5 text-left shadow-[0_1px_2px_rgba(60,40,20,.15)] ring-1 ring-[#e0cfae] active:scale-[0.98]">
                    <Cushion w={w} />
                    <div className="px-1 pb-0.5 pt-1.5">
                      <div className="line-clamp-2 min-h-[2.4em] text-[12px] font-semibold leading-tight text-[#22304d]">{tidyName(w.name)}</div>
                      <div className="mt-0.5"><Status w={w} /></div>
                      <div className="mt-0.5 flex items-center justify-between text-[11px] tabular-nums text-[#6d5a43]">
                        <span>{num(Math.max(w.on_hand, 0))} in stock</span>
                        {w.open_pos.some((p) => p.outstanding > 0) && <PackageOpen size={13} className="text-[#b8742a]" aria-label="on order" />}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
              {list.length === 0 && <p className="py-10 text-center text-sm text-[#6d5a43]">No watch here fits that.</p>}
              <p className="mt-3 text-center text-[10.5px] text-[#8a7759]">Stock {when(data.stock_synced_at)} · sales to {day(data.sales_through)}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* A watch opened from the catalogue: the piece in a lit glass case, its details on a card below.
   The catalogue waits beneath, where it was left. */
export function CatalogueWatch({ w, brand, onBack, onDock }: { w: Watch; brand: string; onBack: () => void; onDock: (poId: string) => void }) {
  const toDesk = () => document.getElementById(`desk-${w.product_id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  return (
    <div className="absolute inset-0 z-[55] flex flex-col" style={{ background: WOOD }} role="dialog" aria-label={w.name}>
      <GameHeader title={`${brand} boutique`} sub="The collection" onBack={onBack} label={`Back to the ${brand} collection`} />
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain select-text">
        {/* the case: glass on a walnut plinth, lit from above */}
        <div className="relative flex flex-col items-center pt-4">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-40" style={{ background: 'radial-gradient(40% 70% at 50% 0%, rgba(255,226,160,.35), transparent)' }} />
          <div className="relative w-[196px] rounded-t-md p-2" style={{ background: 'linear-gradient(160deg, rgba(255,255,255,.28), rgba(190,225,255,.10) 40%, rgba(255,255,255,.05))', boxShadow: 'inset 0 0 0 1.5px rgba(255,255,255,.55), 0 0 0 1px rgba(199,155,74,.6)' }}>
            <Cushion w={w} />
            <div className="pointer-events-none absolute inset-y-2 left-3 w-6 skew-x-[-12deg] bg-white/15" />
          </div>
          <div className="h-3 w-[220px] rounded-sm" style={{ background: BRASS }} />
          <div className="h-9 w-[232px] rounded-b-md bg-gradient-to-b from-[#5a3a24] to-[#2f1d12] shadow-[0_8px_16px_rgba(0,0,0,.45)]" />
        </div>
        <div className="relative z-10 mx-2.5 mt-4 rounded-[20px] p-[3px]" style={{ background: BRASS, marginBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}>
          <div className="relative rounded-[17px] bg-[#fbf6ea] px-4 pb-5 pt-4">
            <button onClick={toDesk} aria-label="Add to Manager's Desk" title="Add to Manager's Desk"
              className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-lg text-[#22304d] ring-1 ring-[#d9c8a6]"><BookmarkPlus size={17} /></button>
            <div className="[&>div>h2]:pr-10"><WatchPanel w={w} onDock={onDock} inRoom photo={false} /></div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── the Manager's Desk ───────────────────────────────────────────────── */

/* A saved watch: the photo, the owner's note, and its figures the day it was saved beside today's. */
function SavedWatch({ d, onOpen, onArchive }: { d: Discovery; onOpen: () => void; onArchive: () => void }) {
  const t = d.then, n = d.now;
  const status = (w: Watch) => (w.on_hand > 0 ? CLASS_WORD[w.class] ?? '—' : 'Sold out');
  const rows: [string, string, string][] = [
    ['Stock', num(t.on_hand), n ? num(n.on_hand) : '—'],
    ['Sold 90 days', num(t.u90), n ? num(n.u90) : '—'],
    ['Movement', status(t), n ? status(n) : '—'],
    ['Price', kd(t.price, 0), n ? kd(n.price, 0) : '—'],
  ];
  return (
    <div className="rounded-2xl bg-[#fbf6ea] p-3 ring-1 ring-[#e0cfae]">
      <div className="flex gap-3">
        <button onClick={onOpen} className="w-[76px] shrink-0"><Cushion w={n ?? t} /></button>
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-semibold leading-tight text-[#22304d]">{tidyName(d.name)}</div>
          <div className="mt-0.5 text-[11px] text-[#7b6a55]">Saved {when(d.at)} · {d.by}</div>
          {d.note && <p className="mt-1.5 rounded-lg bg-white px-2.5 py-1.5 text-[12.5px] italic leading-snug text-[#3d3a35] ring-1 ring-[#eadfca]">“{d.note}”</p>}
        </div>
      </div>
      <table className="mt-2.5 w-full text-[12px] tabular-nums">
        <thead><tr className="text-[#7b6a55]"><th className="py-1 text-left font-medium" /><th className="py-1 text-right font-semibold">Then ({day(t.taken_at)})</th><th className="py-1 text-right font-semibold">Now</th></tr></thead>
        <tbody>
          {rows.map(([k, a, b]) => (
            <tr key={k} className="border-t border-[#eadfca]">
              <td className="py-1 text-[#6d5a43]">{k}</td><td className="py-1 text-right text-[#22304d]">{a}</td>
              <td className={`py-1 text-right font-semibold ${a !== b ? 'text-[#b8742a]' : 'text-[#22304d]'}`}>{b}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!n && <p className="mt-1 text-[11px] text-[#7b6a55]">No longer in a boutique.</p>}
      <div className="mt-2.5 flex gap-2">
        <button onClick={onOpen} className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-[#22304d] px-3 py-2.5 text-[13px] font-semibold text-white">Go to watch <ChevronRight size={15} /></button>
        <button onClick={onArchive} aria-label="Archive" title="Archive (kept in the history)" className="grid h-10 w-10 place-items-center rounded-xl text-[#6d5a43] ring-1 ring-[#d9c8a6]"><Archive size={16} /></button>
      </div>
    </div>
  );
}

export function DeskPanel({ onOpen }: { onOpen: (d: Discovery) => void }) {
  const [list, setList] = useState<Discovery[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const read = () => loadDesk().then(setList, (e) => setErr((e as Error).message));
  useEffect(() => { read(); }, []);
  const archive = async (id: string) => { try { await archiveDiscovery(id); read(); } catch (e) { setErr((e as Error).message); } };
  return (
    <div>
      <h2 className="pr-8 text-lg font-semibold text-[#22304d]">Manager's Desk</h2>
      <p className="text-[12.5px] text-slate-500">Saved watches, then and now.</p>
      {err && <p className="mt-2 text-xs text-rose-700">{err}</p>}
      {!list ? <div className="flex items-center gap-2 py-4 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" /> Loading…</div>
        : list.length === 0 ? <p className="mt-4 rounded-xl bg-[#f6f1e7] p-4 text-sm text-slate-600">Nothing saved yet. Inside a boutique, open a watch and choose “Add to Manager's Desk”.</p>
        : (
          <div className="mt-3 space-y-3">
            {list.map((d) => (
              <SavedWatch key={d.id} d={d} onOpen={() => onOpen(d)} onArchive={() => archive(d.id)} />
            ))}
          </div>
        )}
      <p className="mt-3 text-[11px] text-slate-400">Only the owners see the desk. Nothing here creates a task or a message.</p>
    </div>
  );
}
