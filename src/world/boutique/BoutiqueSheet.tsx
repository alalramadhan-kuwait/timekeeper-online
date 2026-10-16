import { useEffect, useMemo, useState } from 'react';
import { Archive, BookmarkPlus, Check, ChevronRight, Loader2, PackageOpen, Truck } from 'lucide-react';
import { day, kd, num, when } from '../format';
import {
  CLASS_COLOUR, CLASS_WORD, LENSES, SORTS, SOURCE_BADGE, archiveDiscovery, loadDesk, matches, saveDiscovery, shelfOf, sortWatches,
  type BoutiqueData, type Discovery, type Lens, type SortKey, type Watch,
} from './data';

/* The boutique's sheets: a watch, the browser of all its watches, and the Manager's Desk.
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

/* ── every watch in the boutique ─────────────────────────────────────── */

export function BrowsePanel({ data, lens, onLens, onOpen }: { data: BoutiqueData; lens: Lens; onLens: (l: Lens) => void; onOpen: (id: string) => void }) {
  const [sort, setSort] = useState<SortKey>('sold90');
  // how many are listed: 24 at first, and again whenever the filter or the order changes
  const [more, setMore] = useState({ key: '', n: 24 });
  const shown = more.key === `${lens}/${sort}` ? more.n : 24;
  const setShown = (f: (n: number) => number) => setMore({ key: `${lens}/${sort}`, n: f(shown) });
  const list = useMemo(() => sortWatches(data.products.filter((w) => matches(w, lens)), sort), [data, lens, sort]);
  const counts = useMemo(() => Object.fromEntries(LENSES.map((l) => [l.key, data.products.filter((w) => matches(w, l.key)).length])), [data]);
  return (
    <div>
      <h2 className="pr-8 text-lg font-semibold text-[#22304d]">{data.brand}<span className="ml-2 text-sm font-normal text-slate-500">{num(data.products.length)} watches</span></h2>
      <div className="-mx-1 mt-2 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
        {LENSES.map((l) => (
          <button key={l.key} onClick={() => onLens(l.key)} aria-pressed={lens === l.key}
            className={`shrink-0 rounded-full px-3 py-1.5 text-[12.5px] font-medium ${lens === l.key ? 'bg-[#22304d] text-white' : 'bg-[#f6f1e7] text-[#22304d]'}`}>
            {l.label} <span className="tabular-nums opacity-70">{counts[l.key]}</span>
          </button>
        ))}
      </div>
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
        {SORTS.map((x) => (
          <button key={x.key} onClick={() => setSort(x.key)} aria-pressed={sort === x.key}
            className={`shrink-0 rounded-full border px-3 py-1 text-[12px] ${sort === x.key ? 'border-[#b8893b] bg-[#fbf3e2] text-[#7a5a1c]' : 'border-slate-200 text-slate-600'}`}>{x.label}</button>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2.5">
        {list.slice(0, shown).map((w) => (
          <button key={w.product_id} onClick={() => onOpen(w.product_id)} className="overflow-hidden rounded-2xl border border-[#eee5d4] bg-white text-left">
            <div className="grid place-items-center bg-white p-1.5"><Photo w={w} size={140} /></div>
            <div className="px-2.5 pb-2.5">
              <div className="line-clamp-2 min-h-[2.5em] text-[12.5px] font-semibold leading-tight text-[#22304d]">{w.name}</div>
              <div className="mt-1 flex items-center gap-1.5 text-[11.5px] tabular-nums text-slate-600">
                <span className="h-2 w-2 shrink-0 rounded-full ring-1 ring-[#8f8a80]" style={{ background: shelfOf(w) === 'in_stock' ? CLASS_COLOUR[w.class] : '#ffffff' }} />
                {w.on_hand > 0 ? `${num(w.on_hand)} in stock` : 'sold out'} · {num(w.u90)} sold/90d
                {w.open_pos.some((p) => p.outstanding > 0) && <PackageOpen size={13} className="text-amber-700" aria-label="on order" />}
              </div>
            </div>
          </button>
        ))}
      </div>
      {list.length === 0 && <p className="py-6 text-center text-sm text-slate-500">No watch here fits that.</p>}
      {shown < list.length && (
        <button onClick={() => setShown((n) => n + 24)} className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-600">Show {Math.min(24, list.length - shown)} more</button>
      )}
      <p className="mt-3 text-[11px] text-slate-400">Stock to {when(data.stock_synced_at)} · sales to {day(data.sales_through)} · classes by the Stock Analyst.</p>
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
