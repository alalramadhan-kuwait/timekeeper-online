import { useEffect } from 'react';
import { motion, useAnimationControls, useDragControls, useReducedMotion, type PanInfo } from 'motion/react';
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

// Apple-design sheet on real springs (Motion): enters from the bottom, and on mobile
// the header can be grabbed and thrown down to dismiss — the drag hands its velocity
// to the spring (§5), momentum is projected to decide dismiss vs snap (§6), the motion
// is interruptible (§3) and rubber-bands upward (§9). Desktop = a quick pop.
const SHEET_SPRING = { type: 'spring', bounce: 0.15, duration: 0.42 } as const;
const POP_SPRING = { type: 'spring', bounce: 0, duration: 0.24 } as const;
const projectY = (v: number) => (v / 1000) * 0.998 / (1 - 0.998); // §6
const isMobileSheet = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches;

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const controls = useAnimationControls();
  const dragCtl = useDragControls();
  const reduce = useReducedMotion();
  const mobile = isMobileSheet();

  useEffect(() => {
    if (reduce) { controls.set({ y: 0, opacity: 1, scale: 1 }); return; }
    if (mobile) { controls.set({ y: '100%' }); controls.start({ y: 0, transition: SHEET_SPRING }); }
    else { controls.set({ opacity: 0, y: 8, scale: 0.99 }); controls.start({ opacity: 1, y: 0, scale: 1, transition: POP_SPRING }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function close() {
    if (reduce) { await controls.start({ opacity: 0, transition: { duration: 0.12 } }); onClose(); return; }
    if (mobile) { await controls.start({ y: '100%', transition: { type: 'spring', bounce: 0, duration: 0.32 } }); onClose(); }
    else { await controls.start({ opacity: 0, y: 8, scale: 0.99, transition: { duration: 0.16 } }); onClose(); }
  }

  function onDragEnd(_e: PointerEvent | MouseEvent | TouchEvent, info: PanInfo) {
    const h = window.innerHeight;
    const projected = info.offset.y + projectY(info.velocity.y);
    if (info.offset.y > 0 && (projected > h * 0.35 || info.velocity.y > 600)) {
      controls.start({ y: '100%', transition: { type: 'spring', bounce: 0, duration: 0.3, velocity: info.velocity.y } }).then(onClose);
    } else {
      controls.start({ y: 0, transition: { type: 'spring', bounce: 0.12, duration: 0.4, velocity: info.velocity.y } });
    }
  }

  const dragProps = mobile && !reduce
    ? { drag: 'y' as const, dragControls: dragCtl, dragListener: false, dragConstraints: { top: 0, bottom: 0 }, dragElastic: { top: 0.12, bottom: 1 }, onDragEnd }
    : {};

  return (
    <motion.div className="fixed inset-0 z-50 bg-white flex flex-col" style={{ willChange: 'transform' }} animate={controls} {...dragProps}>
      <div
        onPointerDown={(e) => { if (mobile && !reduce && !(e.target as HTMLElement).closest('button')) dragCtl.start(e); }}
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
    </motion.div>
  );
}

export function Spinner() {
  return <div className="p-10 text-center text-slate-400">Loading…</div>;
}
