import { useRef } from 'react';
import { X, ChevronLeft } from 'lucide-react';

export function Card({ title, value, sub, accent }: { title: string; value: string | number; sub?: string; accent?: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
      <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">{title}</div>
      <div className={`text-2xl font-bold mt-1 ${accent ?? 'text-slate-900'}`}>{value}</div>
      {sub && <div className="text-xs text-slate-400 mt-1">{sub}</div>}
    </div>
  );
}

export function Badge({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium border ${className ?? 'bg-slate-100 text-slate-600 border-slate-200'}`}>
      {children}
    </span>
  );
}

export const statusColors: Record<string, string> = {
  // shared
  Cancelled: 'bg-slate-100 text-slate-500 border-slate-200',
  Completed: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  'Sold Out': 'bg-emerald-100 text-emerald-700 border-emerald-200',
  // waiting list
  Open: 'bg-blue-100 text-blue-700 border-blue-200',
  Contacted: 'bg-amber-100 text-amber-700 border-amber-200',
  Converted: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  // CRM cases
  Won: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  Lost: 'bg-rose-100 text-rose-700 border-rose-200',
  'No Response': 'bg-slate-100 text-slate-500 border-slate-200',
  Closed: 'bg-slate-100 text-slate-500 border-slate-200',
  // pre-orders
  'Pending confirmation': 'bg-slate-100 text-slate-600 border-slate-200',
  Confirmed: 'bg-blue-100 text-blue-700 border-blue-200',
  'Deposit paid': 'bg-violet-100 text-violet-700 border-violet-200',
  Ordered: 'bg-amber-100 text-amber-700 border-amber-200',
  Arrived: 'bg-cyan-100 text-cyan-700 border-cyan-200',
  Delivered: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  // PO
  Sent: 'bg-blue-100 text-blue-700 border-blue-200',
  Dispatched: 'bg-violet-100 text-violet-700 border-violet-200',
  'Partially received': 'bg-amber-100 text-amber-700 border-amber-200',
  Received: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  Returned: 'bg-rose-100 text-rose-700 border-rose-200',
  // consignment
  'With consignee': 'bg-blue-100 text-blue-700 border-blue-200',
  Sold: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  'Pending payment': 'bg-amber-100 text-amber-700 border-amber-200',
  // leave / employees
  Pending: 'bg-amber-100 text-amber-700 border-amber-200',
  Approved: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  Rejected: 'bg-rose-100 text-rose-700 border-rose-200',
  Active: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  'On leave': 'bg-amber-100 text-amber-700 border-amber-200',
  Resigned: 'bg-slate-100 text-slate-500 border-slate-200',
  Terminated: 'bg-rose-100 text-rose-700 border-rose-200',
  // documents
  Valid: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  'Renewal in progress': 'bg-amber-100 text-amber-700 border-amber-200',
  Expired: 'bg-red-100 text-red-700 border-red-200',
  // priority
  High: 'bg-red-100 text-red-700 border-red-200',
  Medium: 'bg-amber-100 text-amber-700 border-amber-200',
  Low: 'bg-slate-100 text-slate-500 border-slate-200',
};

export function StatusBadge({ value }: { value: string }) {
  return <Badge className={statusColors[value]}>{value}</Badge>;
}

// Apple-design sheet: full-screen page that enters from the bottom and, on mobile,
// can be grabbed by the header and thrown down to dismiss (1:1 tracking, velocity
// projection, rubber-band, interruptible). Desktop stays a plain full-screen page.
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const sheet = useRef<HTMLDivElement>(null);
  const drag = useRef<{ active: boolean; startY: number; dy: number; hist: { y: number; t: number }[] }>({ active: false, startY: 0, dy: 0, hist: [] });

  const reduce = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mobile = () => window.matchMedia('(max-width: 639px)').matches;
  const setY = (y: number, animate: boolean) => {
    const el = sheet.current; if (!el) return;
    el.style.transition = animate ? 'transform 320ms cubic-bezier(0.22,1,0.36,1)' : 'none';
    el.style.transform = `translateY(${y}px)`;
  };
  const rubber = (over: number) => (over * 400 * 0.55) / (400 + 0.55 * over); // §9 progressive resistance
  const project = (v: number) => (v / 1000) * 0.998 / (1 - 0.998);            // §6 momentum projection

  function close() {
    if (reduce() || !mobile()) { onClose(); return; }
    const h = sheet.current?.getBoundingClientRect().height ?? window.innerHeight;
    setY(h, true); setTimeout(onClose, 300); // §7 exits the way it entered (downward)
  }
  function down(e: React.PointerEvent) {
    if (reduce() || !mobile() || (e.target as HTMLElement).closest('button')) return;
    if (sheet.current) sheet.current.style.animation = 'none'; // §3 start from the live value
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { active: true, startY: e.clientY, dy: 0, hist: [{ y: e.clientY, t: performance.now() }] };
  }
  function move(e: React.PointerEvent) {
    const d = drag.current; if (!d.active) return;
    let dy = e.clientY - d.startY;
    if (dy < 0) dy = -rubber(-dy); // resist dragging up past the top
    d.dy = dy; setY(dy, false);
    d.hist.push({ y: e.clientY, t: performance.now() }); if (d.hist.length > 5) d.hist.shift();
  }
  function up() {
    const d = drag.current; if (!d.active) return; d.active = false;
    const a = d.hist[0], b = d.hist[d.hist.length - 1];
    const v = (b.y - a.y) / Math.max(1, b.t - a.t) * 1000; // release velocity px/s §5
    const h = sheet.current?.getBoundingClientRect().height ?? window.innerHeight;
    if (d.dy > 0 && (d.dy + project(v) > h * 0.35 || v > 600)) { setY(h, true); setTimeout(onClose, 300); }
    else setY(0, true); // snap home
  }

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col tk-sheet tk-sheet-enter" ref={sheet}>
      <div onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
        className="tk-grab shrink-0 border-b border-slate-200 bg-white cursor-grab active:cursor-grabbing" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="sm:hidden flex justify-center pt-2"><span className="h-1.5 w-10 rounded-full bg-slate-300" /></div>
        <div className="flex items-center gap-2 px-4 sm:px-6 py-3">
          <button onClick={close} className="-ml-1 p-1 text-slate-500 hover:text-slate-800 flex items-center gap-1" aria-label="Back">
            <ChevronLeft size={22} /><span className="hidden sm:inline text-sm">Back</span>
          </button>
          <h2 className="font-semibold text-slate-800 flex-1 truncate text-center sm:text-left">{title}</h2>
          <button onClick={close} className="p-1 text-slate-400 hover:text-slate-600" aria-label="Close"><X size={18} /></button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto p-5 sm:p-6">{children}</div>
      </div>
    </div>
  );
}

export function Spinner() {
  return <div className="p-10 text-center text-slate-400">Loading…</div>;
}
