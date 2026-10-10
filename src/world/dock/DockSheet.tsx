import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, X } from 'lucide-react';
import { bayOf, hasReview, kdW, kwDate, shortName, sumOf, type DockData, type DockPo } from './data';
import { num } from '../format';

/* The Loading Dock's sheets, as approved in the v3 design: a supplier (or a shared bay), an
   order with its Items, Receiving and Payment tabs, the Receiving area and the Payments area.
   Big numbers, few words; the details are a tap away and never gone. Every figure comes from
   the dock's records (data.ts); nothing here is worked out beyond adding them up. */

export type DockView =
  | { type: 'bay'; no: number }
  | { type: 'dock-supplier'; key: string }
  | { type: 'dock-po'; id: string; tab?: PoTab }
  | { type: 'dock-recv'; tab?: 'part' | 'hist' }
  | { type: 'dock-pay'; tab?: 'owed' | 'ahead' | 'due' };
type PoTab = 'items' | 'recv' | 'pay';

export const isDockView = (v: { type: string } | null): v is DockView =>
  !!v && ['bay', 'dock-supplier', 'dock-po', 'dock-recv', 'dock-pay'].includes(v.type);

/* An order's sheet covers nearly the whole screen; the others leave the dock in view above. */
export const isFullDockView = (v: DockView) => v.type === 'dock-po';

const NAVY = '#17233b';

/* ── the three status icons: order, shipment, payment; each explains itself on a tap ── */

const ICON = {
  order: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" className="h-3.5 w-3.5"><path d="M2 5l6-3 6 3v6l-6 3-6-3z" /><path d="M2 5l6 3 6-3M8 8v6" /></svg>,
  ship: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" className="h-3.5 w-3.5"><path d="M1 4h9v7H1zM10 7h3l2 2v2h-5" /><circle cx="4" cy="12" r="1.4" /><circle cx="12" cy="12" r="1.4" /></svg>,
  pay: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-3.5 w-3.5"><rect x="1.5" y="3.5" width="13" height="9" rx="1.5" /><path d="M1.5 6.5h13" /></svg>,
};
const ORDER_TONE: Record<string, string> = {
  'Fully Received': 'bg-[#e7f3eb] text-[#2f7a4a]', 'Partially Received': 'bg-[#f5e8cc] text-[#8a5f12]', Ordered: 'bg-[#dfe5ef] text-[#22304d]',
};
const PAY_TONE = { paid: 'bg-[#e7f3eb] text-[#2f7a4a]', part: 'bg-[#fbefd9] text-[#9a6511]', unpaid: 'bg-[#fbe9e5] text-[#a1392a]' };

type Tip = { text: string; x: number; y: number } | null;

function StatusIcons({ p, onTip }: { p: DockPo; onTip: (t: Tip) => void }) {
  const ship = p.shipment
    ? `Shipment: ${p.shipment}`
    : p.expected
      ? `Shipment: unknown. No shipment is recorded; the expected date on record is ${kwDate(p.expected, false)}.`
      : 'Shipment: unknown. No shipment or arrival date has been recorded for this order.';
  const items: [string, string, ReactNode][] = [
    [`Order status in Lightspeed: ${p.status}`, ORDER_TONE[p.status] ?? 'bg-[#eceff4] text-[#7a869c]', ICON.order],
    [ship, p.shipment ? 'bg-[#dfe5ef] text-[#22304d]' : 'bg-[#f1efe9] text-[#9b9485] outline-dashed outline-[1.5px] -outline-offset-[3px] outline-[#c8c0ae]', ICON.ship],
    [`Payment: ${p.pay === 'part' ? 'part paid' : p.pay} · ${kdW(p.paid)} of ${kdW(p.cost)}`, PAY_TONE[p.pay], ICON.pay],
  ];
  return (
    <span className="ml-2.5 flex gap-1.5">
      {items.map(([text, tone, icon], i) => (
        <button key={i} type="button" aria-label={text} data-tip={text}
          onClick={(e) => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); onTip({ text, x: r.left + r.width / 2, y: r.top }); }}
          className={`relative grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full before:absolute before:-inset-[9px] before:content-[''] ${tone}`}>
          {icon}
        </button>
      ))}
    </span>
  );
}

function TipBubble({ tip, onDone }: { tip: Tip; onDone: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useEffect(() => {
    if (!tip) return;
    const t = setTimeout(onDone, 2600);
    return () => clearTimeout(t);
  }, [tip, onDone]);
  useEffect(() => {
    if (!tip || !ref.current) { setPos(null); return; }
    const w = ref.current.offsetWidth, h = ref.current.offsetHeight;
    setPos({ left: Math.max(8, Math.min(window.innerWidth - w - 8, tip.x - w / 2)), top: tip.y - h - 8 });
  }, [tip]);
  if (!tip) return null;
  return (
    <div ref={ref} id="dock-tip" role="status" className="pointer-events-none fixed z-[60] max-w-[240px] rounded-[10px] bg-[#17233b] px-2.5 py-2 text-[12.5px] leading-[1.35] text-white shadow-[0_6px_16px_rgba(0,0,0,.3)]"
      style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999 }}>{tip.text}</div>
  );
}

/* ── small parts ── */

const Dot = () => <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-[#e8962a] shadow-[0_0_0_2px_rgba(232,150,42,.3)]" title="To review" />;

function Big({ items, className = 'mb-4' }: { items: [ReactNode, string][]; className?: string }) {
  return (
    <div className={`mt-0.5 flex gap-[26px] ${className}`}>
      {items.map(([v, k], i) => (
        <div key={i}>
          <div className="text-[28px] font-extrabold leading-[1.05] tracking-[-0.01em] tabular-nums" style={{ color: NAVY }}>{v}</div>
          <div className="mt-[3px] text-[12px] text-[#667085]">{k}</div>
        </div>
      ))}
    </div>
  );
}

function Bar({ p }: { p: DockPo }) {
  const pct = p.ordered ? Math.round((p.received / p.ordered) * 100) : 0;
  return <span className="h-1.5 flex-1 overflow-hidden rounded-[3px] bg-[#ebe5d8]"><i className="block h-full bg-[#b8893b]" style={{ width: `${pct}%` }} /></span>;
}

function PoRow({ p, amount, open, onTip }: { p: DockPo; amount: string; open: () => void; onTip: (t: Tip) => void }) {
  return (
    <div role="button" tabIndex={0} data-po={p.po} onClick={open} onKeyDown={(e) => { if (e.key === 'Enter') open(); }}
      className="block w-full cursor-pointer border-t border-[#efe9dd] px-0.5 py-[13px] text-left first:border-t-0">
      <div className="flex items-center gap-[7px]">
        <span className="text-[15.5px] font-bold" style={{ color: NAVY }}>{p.po}</span>
        {hasReview(p) && <Dot />}
        <span className="ml-auto text-[16px] font-extrabold tabular-nums" style={{ color: NAVY }}>{amount}</span>
      </div>
      <div className="mt-2 flex items-center">
        <Bar p={p} />
        <span className="ml-2 min-w-[62px] text-right text-[12px] tabular-nums text-[#667085]">{num(p.received)}/{num(p.ordered)}</span>
        <StatusIcons p={p} onTip={onTip} />
      </div>
    </div>
  );
}

function Tabs<T extends string>({ items, on, set }: { items: [T, string][]; on: T; set: (t: T) => void }) {
  return (
    <div role="tablist" className={`mb-1.5 mt-3.5 grid gap-0 rounded-xl bg-[#efe8da] p-[3px] ${items.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
      {items.map(([k, l]) => (
        <button key={k} type="button" role="tab" aria-selected={k === on} data-tab={k} onClick={() => set(k)}
          className={`min-h-[38px] rounded-[9px] px-1 py-[9px] text-[13.5px] font-semibold leading-none text-[#22304d] ${k === on ? 'bg-white shadow-[0_1px_3px_rgba(0,0,0,.12)]' : ''}`}>{l}</button>
      ))}
    </div>
  );
}

function KV({ rows }: { rows: [string, ReactNode, boolean?][] }) {
  return (
    <div className="grid grid-cols-[1fr_auto] gap-x-2.5 gap-y-3 px-0.5 py-2 text-[14.5px]">
      {rows.map(([k, v, dim]) => [
        <span key={`k${k}`} className="text-[#667085]">{k}</span>,
        <span key={`v${k}`} className={`text-right tabular-nums ${dim ? 'font-medium text-[#a39b8a]' : 'font-bold'}`} style={dim ? undefined : { color: NAVY }}>{v}</span>,
      ])}
    </div>
  );
}

const Tiny = ({ children }: { children: ReactNode }) => <div className="mt-3.5 text-[12px] text-[#9a917f]">{children}</div>;
const Legend = () => (
  <div className="mb-2.5 mt-1.5 flex flex-wrap gap-3.5 text-[12px] text-[#667085]">
    <span className="inline-flex items-center gap-1.5"><i className="h-3 w-3 rounded-full bg-[#22304d]" />Lightspeed time</span>
    <span className="inline-flex items-center gap-1.5"><i className="h-3 w-3 rounded-full border-2 border-[#b8893b] bg-white" />First seen</span>
  </div>
);
const Mark = ({ basis }: { basis: 'ls' | 'det' }) => <span className={`mt-[3px] h-3 w-3 shrink-0 rounded-full ${basis === 'ls' ? 'bg-[#22304d]' : 'border-2 border-[#b8893b] bg-white'}`} />;

/* ── the sheet ── */

export interface DockSheetProps {
  view: DockView; dock: DockData; canGoBack: boolean;
  open: (v: DockView) => void; back: () => void; close: () => void;
  panelRef: React.Ref<HTMLElement>;
}

export function DockSheet({ view, dock, canGoBack, open, back, close, panelRef }: DockSheetProps) {
  const [tip, setTip] = useState<Tip>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const full = isFullDockView(view);
  const asOf = kwDate(dock.asOf);
  let title: ReactNode = '', sub: ReactNode = null, pin: ReactNode = null, body: ReactNode = null;
  const openPo = (p: DockPo) => open({ type: 'dock-po', id: p.id });

  if (view.type === 'bay' || view.type === 'dock-supplier') {
    const bay = view.type === 'bay' ? dock.bays.find((b) => b.no === view.no) : null;
    const sp = view.type === 'dock-supplier' ? dock.suppliers.find((x) => x.key === view.key) : bay && bay.suppliers.length === 1 ? bay.suppliers[0] : null;
    if (sp) {
      title = shortName(sp.name);
      body = (<>
        <Big items={[[sp.pos.length, `open order${sp.pos.length === 1 ? '' : 's'}`], [kdW(sp.value), 'still to come']]} />
        <div>{sp.pos.map((p) => <PoRow key={p.id} p={p} amount={kdW(p.outstanding)} open={() => openPo(p)} onTip={setTip} />)}</div>
      </>);
    } else if (bay) {
      title = `Bay ${String(bay.no).padStart(2, '0')}`;
      body = bay.suppliers.map((s) => (
        <div key={s.key} role="button" tabIndex={0} data-sup={s.key} onClick={() => open({ type: 'dock-supplier', key: s.key })}
          className="block w-full cursor-pointer border-t border-[#efe9dd] px-0.5 py-[13px] first:border-t-0">
          <div className="flex items-center gap-[7px]"><span className="text-[15.5px] font-bold" style={{ color: NAVY }}>{shortName(s.name)}</span><span className="ml-auto text-[16px] font-extrabold tabular-nums" style={{ color: NAVY }}>{kdW(s.value)}</span></div>
          <div className="mt-2 text-[12px] text-[#667085]">{s.pos.length} order{s.pos.length === 1 ? '' : 's'}</div>
        </div>
      ));
    }
  } else if (view.type === 'dock-po') {
    const p = dock.pos.find((x) => x.id === view.id);
    if (p) return <PoSheet key={p.id} p={p} dock={dock} tab0={view.tab ?? 'items'} canGoBack={canGoBack} back={back} close={close} panelRef={panelRef} />;
    title = 'Order not found';
  } else if (view.type === 'dock-recv') {
    return <ReceivingSheet key="recv" dock={dock} tab0={view.tab ?? 'part'} canGoBack={canGoBack} back={back} close={close} panelRef={panelRef} openPo={openPo} />;
  } else if (view.type === 'dock-pay') {
    return <PaymentsSheet key="pay" dock={dock} tab0={view.tab ?? 'owed'} canGoBack={canGoBack} back={back} close={close} panelRef={panelRef} openPo={openPo} />;
  }
  return <Frame {...{ title, sub, pin, body, full, canGoBack, back, close, panelRef, bodyRef, tip, setTip, asOf }} />;
}

function Frame({ title, sub, pin, body, full, canGoBack, back, close, panelRef, bodyRef, tip, setTip }: {
  title: ReactNode; sub: ReactNode; pin: ReactNode; body: ReactNode; full: boolean; canGoBack: boolean;
  back: () => void; close: () => void; panelRef: React.Ref<HTMLElement>; bodyRef?: React.Ref<HTMLDivElement>; tip: Tip; setTip: (t: Tip) => void; asOf?: string;
}) {
  return (
    <aside ref={panelRef} role="dialog" aria-modal="false" aria-label={typeof title === 'string' ? title : undefined}
      className={`tk-sheet-enter absolute inset-x-0 bottom-0 z-40 flex flex-col rounded-t-[22px] bg-[#fbf8f1] shadow-[0_-10px_30px_rgba(0,0,0,.22)] sm:inset-x-auto sm:bottom-3 sm:right-3 sm:top-3 sm:h-auto sm:max-h-none sm:w-[400px] sm:rounded-3xl ${full ? 'h-[90%]' : 'max-h-[56%]'}`}
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      <div className="mx-auto mt-2 h-[5px] w-10 shrink-0 rounded-[3px] bg-[#d4cbb8] sm:hidden" />
      <div className="flex shrink-0 items-center gap-2 pb-2.5 pl-4 pr-3.5 pt-2">
        {canGoBack && <button type="button" onClick={back} aria-label="Back" className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#ede6d6] text-[#17233b]"><ChevronLeft size={20} /></button>}
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[20px] font-bold leading-tight" style={{ color: NAVY }}>{title}</h2>
          {sub && <div className="mt-0.5 truncate text-[13px] text-[#667085]">{sub}</div>}
        </div>
        <button type="button" onClick={close} aria-label="Close" className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#ede6d6] text-[#17233b]"><X size={19} /></button>
      </div>
      {pin && <div className="shrink-0 px-4" data-pin>{pin}</div>}
      <div ref={bodyRef} data-body className="overflow-y-auto overscroll-contain px-4 pb-[26px] select-text">{body}</div>
      <TipBubble tip={tip} onDone={() => setTip(null)} />
    </aside>
  );
}

type SheetBase = { canGoBack: boolean; back: () => void; close: () => void; panelRef: React.Ref<HTMLElement> };

function PoSheet({ p, dock, tab0, ...f }: SheetBase & { p: DockPo; dock: DockData; tab0: PoTab }) {
  const [tab, setTab] = useState<PoTab>(tab0);
  const [tip, setTip] = useState<Tip>(null);
  const [all, setAll] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const reviews = p.flags.filter((x) => x.level === 'review'), notes = p.flags.filter((x) => x.level === 'note');
  const flags = [...reviews, ...notes];
  const pick = (t: PoTab) => { setTab(t); bodyRef.current?.scrollTo(0, 0); };
  // the order's key figures, its progress, its three states, what to review and the tabs stay put
  const pin = (<>
    <Big className="mb-2.5" items={[[kdW(p.outstanding), 'still to come'], [<>{num(p.received)}<span className="text-[18px] font-bold text-[#667085]">/{num(p.ordered)}</span></>, 'pieces received']]} />
    <div className="flex items-center"><Bar p={p} /><StatusIcons p={p} onTip={setTip} /></div>
    {flags.length > 0 && (
      <details className="group mb-1 mt-3 overflow-hidden rounded-xl border border-[#f0d3a6] bg-[#fff3e2]" data-review>
        <summary className="flex min-h-[44px] cursor-pointer list-none items-center gap-2 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
          <Dot /><span className="text-[14px] font-bold text-[#7a4510]">{reviews.length ? `${reviews.length} item${reviews.length === 1 ? '' : 's'} to review` : `${notes.length} note${notes.length === 1 ? '' : 's'}`}</span>
          <span className="text-[18px] text-[#b5ab96] transition-transform group-open:rotate-90">›</span>
        </summary>
        <div className="max-h-[26vh] overflow-y-auto">
          {flags.map((x, i) => <div key={i} className="pb-2.5 pl-8 pr-3 text-[13px] leading-[1.4] text-[#5a3a12]"><b className="block text-[#7a4510]">{x.title}</b>{x.detail}</div>)}
        </div>
      </details>
    )}
    <Tabs<PoTab> items={[['items', `Items ${p.lines.length}`], ['recv', 'Receiving'], ['pay', 'Payment']]} on={tab} set={pick} />
  </>);
  const shown = all ? p.lines : p.lines.slice(0, 6);
  const supplierBrand = shortName(p.supplier);
  const body = (<>
    {tab === 'items' && (<>
      <div>{shown.map((l, i) => {
        const left = l.ordered - l.received;
        return (
          <div key={i} className="flex items-center gap-2.5 border-t border-[#efe9dd] px-0.5 py-[11px] first:border-t-0">
            <div className="min-w-0">
              <div className="text-[13.5px] font-semibold leading-[1.3]">{l.name ?? <i>No product details</i>}</div>
              <div className="mt-0.5 text-[12px] tabular-nums text-[#667085]">{l.sku ?? 'No SKU'}{l.brand && l.brand !== supplierBrand ? ` · ${l.brand}` : ''} · {kdW(l.cost, 3)}</div>
            </div>
            <div className="ml-auto whitespace-nowrap text-right text-[13px] tabular-nums text-[#667085]">
              {left > 0 ? <b className="block text-[14px]" style={{ color: NAVY }}>{num(left)} to come</b> : <b className="block text-[14px] text-[#2f7a4a]">In</b>}
              {num(l.received)}/{num(l.ordered)}
            </div>
          </div>
        );
      })}</div>
      {!all && p.lines.length > 6 && <button type="button" onClick={() => setAll(true)} className="block w-full border-t border-[#f0eadf] bg-white p-3 text-[13.5px] font-semibold text-[#22304d]">Show all {p.lines.length}</button>}
    </>)}
    {tab === 'recv' && (<>
      <KV rows={[['Shipment', p.shipment ?? 'Unknown', !p.shipment], ['Expected', p.expected ? kwDate(p.expected, false) : 'Not recorded', !p.expected]]} />
      {p.history.length ? (<>
        <Legend />
        {p.history.map((h, i) => (
          <div key={i} className="flex items-center gap-2.5 border-t border-[#efe9dd] px-0.5 py-[11px] first:border-t-0">
            <Mark basis={h.basis} />
            <div><div className="text-[13.5px] font-semibold">{h.part ? 'Received in part' : 'Received'}</div><div className="mt-0.5 text-[12px] tabular-nums text-[#667085]">{h.basis === 'ls' ? kwDate(h.at) : `by ${kwDate(h.at)}`}</div></div>
          </div>
        ))}
      </>) : <Tiny>{p.received > 0 ? `No receiving time on record (log began ${kwDate(dock.logStarted, false)}).` : 'Nothing received yet.'}</Tiny>}
    </>)}
    {tab === 'pay' && (
      <KV rows={[['Total', kdW(p.cost, 3)], ['Paid', kdW(p.paid, 3)], ['Unpaid', kdW(p.unpaid, 3)],
        ['Paid on', p.paidOn ? kwDate(p.paidOn, false) : '—', !p.paidOn], ['Method', p.method ?? '—', !p.method], ['Invoice', p.invoice ? 'Received' : p.invoice === false ? 'Not received' : '—', !p.invoice]]} />
    )}
    <Tiny>Data as of {kwDate(dock.asOf)}</Tiny>
  </>);
  return <Frame title={p.po} sub={shortName(p.supplier)} pin={pin} body={body} full bodyRef={bodyRef} tip={tip} setTip={setTip} {...f} />;
}

function ReceivingSheet({ dock, tab0, openPo, ...f }: SheetBase & { dock: DockData; tab0: 'part' | 'hist'; openPo: (p: DockPo) => void }) {
  const [tab, setTab] = useState(tab0);
  const [tip, setTip] = useState<Tip>(null);
  const byId = new Map(dock.pos.map((p) => [p.id, p]));
  const body = (<>
    <Big items={[[dock.partial.length, 'partly received'], [kdW(sumOf(dock.partial, 'outstanding')), 'still to come']]} />
    <Tabs<'part' | 'hist'> items={[['part', 'Partly received'], ['hist', `History ${dock.history.length}`]]} on={tab} set={setTab} />
    {tab === 'part' && dock.partial.map((p) => <PoRow key={p.id} p={p} amount={kdW(p.outstanding)} open={() => openPo(p)} onTip={setTip} />)}
    {tab === 'hist' && (<>
      <Legend />
      {dock.history.map((h, i) => {
        const p = h.poId ? byId.get(h.poId) : undefined;
        return (
          <div key={i} role={p ? 'button' : undefined} tabIndex={p ? 0 : undefined} onClick={p ? () => openPo(p) : undefined}
            className={`flex items-center gap-2.5 border-t border-[#efe9dd] px-0.5 py-[11px] first:border-t-0 ${p ? 'cursor-pointer' : ''}`}>
            <Mark basis={h.basis} />
            <div className="min-w-0"><div className="truncate text-[13.5px] font-semibold">{h.po}{h.supplier ? ` · ${shortName(h.supplier)}` : ''}</div><div className="mt-0.5 text-[12px] tabular-nums text-[#667085]">{h.basis === 'ls' ? kwDate(h.at) : `by ${kwDate(h.at)}`}</div></div>
            <div className="ml-auto text-[13px] text-[#667085]">{h.part ? 'Part' : 'Full'}</div>
          </div>
        );
      })}
      <Tiny>Receiving log since {kwDate(dock.logStarted, false)}. Earlier receipts show only where Lightspeed kept the time.</Tiny>
    </>)}
  </>);
  return <Frame title="Receiving" sub={null} pin={null} body={body} full={false} tip={tip} setTip={setTip} {...f} />;
}

function PaymentsSheet({ dock, tab0, openPo, ...f }: SheetBase & { dock: DockData; tab0: 'owed' | 'ahead' | 'due'; openPo: (p: DockPo) => void }) {
  const [tab, setTab] = useState(tab0);
  const [tip, setTip] = useState<Tip>(null);
  const pane = (arr: DockPo[], key: 'unpaid' | 'paid', label: string) => (<>
    <Big items={[[kdW(sumOf(arr, key)), label], [arr.length, 'orders']]} />
    {arr.map((p) => <PoRow key={p.id} p={p} amount={kdW(p[key])} open={() => openPo(p)} onTip={setTip} />)}
  </>);
  const body = (<>
    <Tabs<'owed' | 'ahead' | 'due'> items={[['owed', 'Owed'], ['ahead', 'Paid ahead'], ['due', 'Unpaid']]} on={tab} set={setTab} />
    {tab === 'owed' && pane(dock.owed, 'unpaid', 'owed for goods received')}
    {tab === 'ahead' && pane(dock.ahead, 'paid', 'paid before receipt')}
    {tab === 'due' && pane(dock.due, 'unpaid', 'unpaid, nothing received')}
    <Tiny>As entered in Supplier Payments · data as of {kwDate(dock.asOf)}</Tiny>
  </>);
  return <Frame title="Payments" sub={null} pin={null} body={body} full={false} tip={tip} setTip={setTip} {...f} />;
}

/* The bay a dock sheet is about, so its tag can show the supplier's name. */
export function bayForView(dock: DockData, v: DockView): number | null {
  if (v.type === 'bay') return v.no;
  if (v.type === 'dock-supplier') return bayOf(dock, v.key)?.no ?? null;
  return null;
}
