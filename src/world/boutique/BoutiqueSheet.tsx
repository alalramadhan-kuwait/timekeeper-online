import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Archive, ArrowDownUp, ArrowLeft, BookmarkPlus, Check, ChevronLeft, ChevronRight, Loader2, PackageOpen, Truck, Watch as WatchIcon } from 'lucide-react';
import { day, kd, num, when } from '../format';
import {
  CLASS_COLOUR, CLASS_WORD, LENSES, SORTS, SOURCE_BADGE, archiveDiscovery, loadDesk, matches, saveDiscovery, shelfOf, sortWatches, tidyName,
  type BoutiqueData, type Discovery, type Lens, type SortKey, type Watch,
} from './data';

/* The boutique's screens: a watch, the catalogue of all its watches, and the Manager's Desk.
   Every figure is the Stock Analyst's or the order ledger's own, as world_boutique() returns it;
   the screen only words it. Cost is shown because the World is the owners' alone. */

const OUTLET: Record<string, string> = { 'Time Keeper - Avenues': 'Avenues', 'Time Keeper': 'Time Keeper', 'Time Gallery': 'Time Gallery' };
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
  const colour = shelf === 'in_stock' ? CLASS_COLOUR[w.class] : '#ffffff';
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

export function WatchPanel({ w, onDock, onSeeInRoom, inRoom }: {
  w: Watch; onDock: (poId: string) => void; onSeeInRoom?: () => void; inRoom: boolean;
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
      <div className="flex justify-center"><Photo w={w} size={220} big /></div>
      <h2 className="mt-3 text-lg font-semibold leading-snug text-[#22304d]" style={{ textWrap: 'balance' } as React.CSSProperties}>{w.name}</h2>
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

      <section className="mt-4">
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

/* A watch's picture in the catalogue: Lightspeed's 350-pixel image (never the full-size original),
   fetched only as it scrolls near; a quiet placeholder where there is no verified photo. */
function Thumb({ w }: { w: Watch }) {
  const [failed, setFailed] = useState(false);
  const soldOut = w.on_hand <= 0;
  if (!w.image || failed) {
    return (
      <div className="flex aspect-square w-full flex-col items-center justify-center gap-1.5 bg-[#f4efe6] text-[#a39784]">
        <WatchIcon size={30} strokeWidth={1.4} />
        <span className="text-[10.5px]">No photo yet</span>
      </div>
    );
  }
  return (
    <div className="relative aspect-square w-full bg-white">
      <img src={w.image.view} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} width={350} height={350}
        className={`h-full w-full object-contain p-2 ${soldOut ? 'opacity-45 grayscale-[35%]' : ''}`} />
      {SOURCE_BADGE[w.image.source] && <span className="absolute left-1.5 top-1.5 rounded bg-white/90 px-1 text-[9px] font-medium text-slate-600 ring-1 ring-slate-200">{SOURCE_BADGE[w.image.source]}</span>}
    </div>
  );
}

/* How a watch is moving, in a few characters: the Stock Analyst's class and its sales in 90 days. */
function Movement({ w }: { w: Watch }) {
  const inStock = w.on_hand > 0;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[#f6f1e7] px-1.5 py-0.5 text-[10.5px] font-semibold text-[#3d3a35]">
      <span className="h-2 w-2 rounded-full ring-1 ring-black/10" style={{ background: inStock ? CLASS_COLOUR[w.class] : '#d9d4ca' }} />
      {inStock ? CLASS_WORD[w.class] ?? '—' : 'Sold Out'}
      <span className="font-normal tabular-nums text-slate-500">· {num(w.u90)}/90d</span>
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
    <div className="absolute inset-0 z-50 flex flex-col bg-[#fbf8f2]" role="dialog" aria-label={`${data.brand} collection`}>
      <header className="shrink-0 border-b border-[#ece3d2] bg-[#fbf8f2]/95 px-3 pb-2" style={{ paddingTop: 'calc(0.6rem + env(safe-area-inset-top, 0px))' }}>
        <div className="flex items-center gap-2">
          <button onClick={onClose} aria-label="Back to the boutique" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#22304d] text-white"><ArrowLeft size={18} /></button>
          <div className="min-w-0">
            <h2 className="truncate text-[16px] font-semibold text-[#22304d]">{data.brand} · The collection</h2>
            <p className="truncate text-[11.5px] text-slate-500">{num(list.length)} of {num(data.products.length)} watches · stock {when(data.stock_synced_at)}</p>
          </div>
        </div>
        <div className="-mx-3 mt-2 flex gap-1.5 overflow-x-auto px-3 [scrollbar-width:none]" role="toolbar" aria-label="Filter">
          {LENSES.map((l) => (
            <button key={l.key} onClick={() => pick(() => onLens(l.key))} aria-pressed={lens === l.key} disabled={counts[l.key] === 0 && l.key !== lens}
              className={`shrink-0 rounded-full px-3 py-1.5 text-[12.5px] font-medium disabled:opacity-40 ${lens === l.key ? 'bg-[#22304d] text-white' : 'bg-white text-[#22304d] ring-1 ring-[#e6dcc9]'}`}>
              {l.label} <span className="tabular-nums opacity-70">{counts[l.key]}</span>
            </button>
          ))}
        </div>
        <div className="-mx-3 mt-1.5 flex items-center gap-1.5 overflow-x-auto px-3 [scrollbar-width:none]" role="toolbar" aria-label="Sort">
          <ArrowDownUp size={13} className="shrink-0 text-slate-400" />
          {SORTS.map((x) => (
            <button key={x.key} onClick={() => pick(() => onSort(x.key))} aria-pressed={sort === x.key}
              className={`shrink-0 rounded-full px-2.5 py-1 text-[12px] ${sort === x.key ? 'bg-[#f3e6c8] font-semibold text-[#6d4f14]' : 'text-slate-600'}`}>{x.label}</button>
          ))}
        </div>
      </header>
      <div ref={body} onScroll={(e) => { scrollRef.current = e.currentTarget.scrollTop; }} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pt-3"
        style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }}>
        <div className="grid grid-cols-2 gap-2.5">
          {list.map((w) => (
            <button key={w.product_id} onClick={() => onOpen(w.product_id)} className="overflow-hidden rounded-2xl bg-white text-left shadow-[0_1px_3px_rgba(60,40,20,.08)] ring-1 ring-[#eee5d4]">
              <Thumb w={w} />
              <div className="px-2.5 pb-2.5 pt-1.5">
                <div className="line-clamp-2 min-h-[2.4em] text-[12.5px] font-semibold leading-tight text-[#22304d]">{tidyName(w.name)}</div>
                <div className="mt-1 flex items-center justify-between gap-1">
                  <span className={`text-[11.5px] tabular-nums ${w.on_hand > 0 ? 'text-slate-700' : 'text-slate-400'}`}>{w.on_hand > 0 ? `${num(w.on_hand)} in stock` : 'none in stock'}</span>
                  {w.open_pos.some((p) => p.outstanding > 0) && <span className="inline-flex items-center gap-0.5 text-[10.5px] font-medium text-amber-800"><PackageOpen size={12} /> on order</span>}
                </div>
                <div className="mt-1"><Movement w={w} /></div>
              </div>
            </button>
          ))}
        </div>
        {list.length === 0 && <p className="py-10 text-center text-sm text-slate-500">No watch here fits that.</p>}
        <p className="mt-4 text-center text-[11px] text-slate-400">Stock to {when(data.stock_synced_at)} · sales to {day(data.sales_through)} · movement by the Stock Analyst</p>
      </div>
    </div>
  );
}

/* A watch opened from the catalogue: the same detail, over the catalogue, which waits beneath. */
export function CatalogueWatch({ w, brand, onBack, onDock }: { w: Watch; brand: string; onBack: () => void; onDock: (poId: string) => void }) {
  return (
    <div className="absolute inset-0 z-[55] flex flex-col bg-white" role="dialog" aria-label={w.name}>
      <header className="flex shrink-0 items-center gap-2 border-b border-slate-100 px-3 pb-2" style={{ paddingTop: 'calc(0.6rem + env(safe-area-inset-top, 0px))' }}>
        <button onClick={onBack} className="flex h-10 items-center gap-1 rounded-full bg-[#f6f1e7] pl-2 pr-3.5 text-[13.5px] font-medium text-[#22304d]"><ChevronLeft size={18} /> {brand} collection</button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-3 select-text" style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }}>
        <WatchPanel w={w} onDock={onDock} inRoom />
      </div>
    </div>
  );
}

/* ── the Manager's Desk ───────────────────────────────────────────────── */

function thenNow(d: Discovery) {
  const t = d.then, n = d.now;
  const word = (w: Watch) => (shelfOf(w) === 'in_stock' ? CLASS_WORD[w.class] ?? w.class : 'Sold out');
  if (!n) return `Then ${num(t.on_hand)} in stock · ${word(t)} → now no longer in a boutique`;
  return `Then ${num(t.on_hand)} in stock · ${num(t.u90)} sold/90d · ${word(t)} → now ${num(n.on_hand)} · ${num(n.u90)} · ${word(n)}`;
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
      <p className="text-sm text-slate-500">Watches the owners saved. "Then" is the day it was saved; "now" is today.</p>
      {err && <p className="mt-2 text-xs text-rose-700">{err}</p>}
      {!list ? <div className="flex items-center gap-2 py-4 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" /> Loading…</div>
        : list.length === 0 ? <p className="mt-4 rounded-xl bg-[#f6f1e7] p-4 text-sm text-slate-600">Nothing saved yet. Inside a boutique, open a watch and choose “Add to Manager's Desk”.</p>
        : (
          <div className="mt-3 space-y-2.5">
            {list.map((d) => (
              <div key={d.id} className="flex gap-3 rounded-2xl border border-[#eee5d4] p-2.5">
                <button onClick={() => onOpen(d)} className="shrink-0"><Photo w={d.now ?? d.then} size={72} /></button>
                <div className="min-w-0 flex-1">
                  <button onClick={() => onOpen(d)} className="block text-left text-[13.5px] font-semibold leading-tight text-[#22304d]">{d.name}</button>
                  {d.note && <p className="mt-0.5 text-[12.5px] text-slate-700">“{d.note}”</p>}
                  <p className="mt-0.5 text-[11px] text-slate-500">{d.brand} · {d.by} · {when(d.at)}</p>
                  <p className="mt-1 text-[11.5px] tabular-nums text-slate-600">{thenNow(d)}</p>
                </div>
                <button onClick={() => archive(d.id)} aria-label="Archive" title="Archive" className="grid h-8 w-8 shrink-0 place-items-center self-start rounded-full text-slate-400 hover:bg-slate-100"><Archive size={15} /></button>
              </div>
            ))}
          </div>
        )}
      <p className="mt-3 text-[11px] text-slate-400">Only the owners see the desk. Nothing here creates a task or a message.</p>
    </div>
  );
}
