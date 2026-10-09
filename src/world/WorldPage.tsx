import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronLeft, Minus, Plus, RefreshCw, Search, X } from 'lucide-react';
import avatar from '../assets/ask-mohammed.webp';
import { loadSnapshot } from './api';
import { buildModel, missionTitle, type Room } from './model';
import { createGame, type WorldGame } from './game/createGame';
import type { Selection } from './game/WorldScene';
import { Loading, PanelBody, type View } from './panels';
import { clock, day, kd, kd0, num } from './format';
import type { Snapshot } from './types';

/**
 * Time Keeper World («عالم تايم كيبر»): the owners' living map of the boutique
 * floor, the loading dock and the manager's office.
 *
 * Loaded as its own file, only after the server has confirmed the person is one
 * of the three owners; every figure is fetched through the owner-only World
 * functions, which check again. The game draws; this page holds the words, the
 * numbers and the panels, so Arabic, search and accessibility work as anywhere
 * else in the app.
 */

const ROOMS: { room: Room; label: string; short: string }[] = [
  { room: 'floor', label: 'Boutique Floor', short: 'Floor' },
  { room: 'dock', label: 'Loading Dock', short: 'Dock' },
  { room: 'office', label: "Manager's Office", short: 'Office' },
];

export default function WorldPage({ onClose }: { onClose?: () => void }) {
  const navigate = useNavigate();
  const close = onClose ?? (() => navigate('/'));
  const host = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const game = useRef<WorldGame | null>(null);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [room, setRoom] = useState<Room>('floor');
  const [stack, setStack] = useState<View[]>([]);
  const [busy, setBusy] = useState(false);
  // when each source was last updated
  const fresh = useMemo(() => snap ? [
    `Stock ${clock(snap.meta.stock.stock_synced_at)}`,
    `POs ${clock(snap.meta.po.last_sync)}`,
    `Sales to ${day(snap.meta.sales_through)}`,
  ] : [], [snap]);

  const model = useMemo(() => (snap ? buildModel(snap) : null), [snap]);

  const refresh = useCallback(async () => {
    setBusy(true);
    try { setSnap(await loadSnapshot()); setErr(null); }
    catch (e) { setErr((e as Error).message); }
    setBusy(false);
  }, []);

  useEffect(() => {
    let live = true;
    loadSnapshot().then((s) => { if (live) setSnap(s); }, (e) => { if (live) setErr((e as Error).message); });
    return () => { live = false; };
  }, []);
  // the stock cache refreshes hourly and the PO sync daily; follow them while open
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, 30 * 60 * 1000);
    return () => clearInterval(t);
  }, [refresh]);

  // boot the game once there is something to draw
  useEffect(() => {
    if (!model || game.current || !host.current) return;
    game.current = createGame(host.current, model, {
      onSelect: (s: Selection | null) => setStack(s ? [s] : []),
      onReady: () => setReady(true),
    });
  }, [model]);
  useEffect(() => { if (model && ready) game.current?.setModel(model); }, [model, ready]);
  // tell the game how much of the screen the bars cover, then frame the first area
  useEffect(() => {
    if (!ready) return;
    const bottom = window.innerWidth < 640 ? 96 : 24;
    game.current?.setInsets(headerRef.current?.getBoundingClientRect().bottom ?? 0, bottom);
    game.current?.focus(room);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);
  useEffect(() => () => { game.current?.destroy(); game.current = null; }, []);

  useEffect(() => {
    const prev = document.title;
    document.title = 'Time Keeper World';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setStack([]); };
    window.addEventListener('keydown', onKey);
    return () => { document.title = prev; window.removeEventListener('keydown', onKey); };
  }, []);

  const view = stack[stack.length - 1] ?? null;
  // keep what was tapped in sight beside the side panel, or above the phone sheet
  const first = stack[0];
  useEffect(() => {
    if (!first) {
      // the panel closed (button, Escape or a tap on the floor): the view may settle back
      game.current?.clearSelection();
      game.current?.reveal(0, 0, 0);
      return;
    }
    const a = panelRef.current;
    if (!a) return;
    // measured again as the panel grows, since details arrive after it opens
    const ro = new ResizeObserver(() => {
      const h = headerRef.current;
      if (!h) return;
      const wide = window.innerWidth >= 640;
      game.current?.reveal(h.offsetTop + h.offsetHeight, wide ? a.offsetWidth + 12 : 0, wide ? 0 : a.offsetHeight);
    });
    ro.observe(a);
    return () => ro.disconnect();
  }, [first]);
  const open = useCallback((v: View) => setStack((s) => [...s, v]), []);
  const closePanel = () => { setStack([]); game.current?.clearSelection(); };
  const cabinets = useMemo(() => model?.cabinets.reduce<Snapshot['floor']['shelves'][]>((a, c) => { a[c.index] = c.shelves; return a; }, []) ?? [], [model]);

  if (err && !snap) {
    const denied = /owner|permission|42501|not allowed/i.test(err);
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#dfca93] p-6">
        <div className="max-w-sm rounded-2xl bg-white p-6 text-center shadow-xl">
          <h1 className="text-lg font-semibold text-[#22304d]">{denied ? 'Only the owners can open the World' : "The World didn't open"}</h1>
          <p className="mt-2 text-sm text-slate-600">{denied ? 'Time Keeper World is for the three owners.' : err}</p>
          <div className="mt-4 flex justify-center gap-2">
            {!denied && <button onClick={refresh} className="rounded-xl bg-[#22304d] px-4 py-2 text-sm font-medium text-white">Try again</button>}
            <button onClick={close} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700">Back to the app</button>
          </div>
        </div>
      </div>
    );
  }

  const top = model?.topMission;
  const todo = snap ? snap.missions.filter((m) => m.state === 'open' || m.state === 'changed_since_review').length : 0;

  return (
    <div className="fixed inset-0 z-50 select-none overflow-hidden bg-[#dfca93] text-slate-900">
      <div ref={host} className="absolute inset-0 touch-none" aria-label="Time Keeper World map" />

      {(!snap || !ready) && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-[#dfca93]">
          <img src={avatar} alt="" className="h-20 w-20 rounded-full bg-amber-400 ring-4 ring-white motion-safe:animate-pulse" />
          <div className="text-center">
            <div className="font-semibold text-[#22304d]">Opening Time Keeper World…</div>
            <div className="text-sm text-[#6f5a3c]" dir="rtl">عالم تايم كيبر</div>
          </div>
        </div>
      )}

      {/* top bar */}
      <header ref={headerRef} className="pointer-events-none absolute inset-x-0 top-0 z-30 flex flex-col gap-2 px-3 sm:px-4"
        style={{ paddingTop: 'calc(0.6rem + env(safe-area-inset-top, 0px))', paddingLeft: 'max(0.75rem, env(safe-area-inset-left, 0px))', paddingRight: 'max(0.75rem, env(safe-area-inset-right, 0px))' }}>
        <div className="flex items-center gap-2">
          <button onClick={close} aria-label="Back to the app"
            className="pointer-events-auto grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#22304d] text-white shadow-lg">
            <ArrowLeft size={18} />
          </button>
          <div className="pointer-events-auto min-w-0 rounded-2xl bg-[#22304d]/95 px-3.5 py-1.5 text-white shadow-lg">
            <div className="flex items-baseline gap-2">
              <h1 className="truncate text-[15px] font-semibold tracking-tight">Time Keeper World</h1>
              <span className="hidden text-sm text-[#d8b45a] min-[420px]:inline" dir="rtl">عالم تايم كيبر</span>
            </div>
            <div className="truncate text-[11px] text-slate-300">{fresh.join(' · ')}</div>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            <button onClick={() => setStack([{ type: 'search' }])} aria-label="Find a PO"
              className="pointer-events-auto grid h-10 w-10 place-items-center rounded-full bg-white text-[#22304d] shadow-lg"><Search size={18} /></button>
            <button onClick={refresh} aria-label="Refresh" disabled={busy}
              className="pointer-events-auto grid h-10 w-10 place-items-center rounded-full bg-white text-[#22304d] shadow-lg disabled:opacity-60">
              <RefreshCw size={17} className={busy ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>
        <nav className="pointer-events-auto flex gap-1 self-start rounded-full bg-white/95 p-1 shadow-lg" aria-label="Areas">
          {ROOMS.map((r) => (
            <button key={r.room} onClick={() => { setRoom(r.room); game.current?.focus(r.room); }}
              className={`whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors ${room === r.room ? 'bg-[#22304d] text-white' : 'text-[#22304d] hover:bg-slate-100'}`}>
              <span className="hidden sm:inline">{r.label}</span><span className="sm:hidden">{r.short}</span>
            </button>
          ))}
        </nav>
        {snap && (
          <div className={`pointer-events-auto -mx-1 ${view ? 'hidden sm:flex' : 'flex'} gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none]`}>
            <Kpi label="Recorded unpaid" value={kd(snap.payments.total)} sub={`${num(snap.payments.pos)} POs`} onClick={() => { game.current?.focus('office'); setRoom('office'); }} />
            <Kpi label="Open POs" value={kd0(snap.commitments.open_po_value)} sub={`${num(snap.commitments.open_pos)} POs`} onClick={() => { game.current?.focus('dock'); setRoom('dock'); }} />
            <Kpi label="Stock at cost" value={kd0(Object.values(snap.floor.totals).reduce((n, t) => n + (t?.cost_value ?? 0), 0))} sub="owned, consignment, pre-owned" onClick={() => { game.current?.focus('floor'); setRoom('floor'); }} />
            <Kpi label="Missions" value={num(todo)} sub="to do" onClick={() => setStack([{ type: 'board' }])} />
          </div>
        )}
      </header>

      {/* Mohammed with today's top mission */}
      {top && !view && (
        <button onClick={() => setStack([{ type: 'mission', key: top.key }])}
          className="absolute bottom-0 left-0 z-30 m-3 flex max-w-[min(420px,calc(100%-5.5rem))] items-center gap-3 rounded-2xl bg-white/95 p-2.5 pr-4 text-left shadow-xl"
          style={{ marginBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}>
          <img src={avatar} alt="" className="h-11 w-11 shrink-0 rounded-full bg-amber-400" />
          <div className="min-w-0">
            <div className="text-[11px] font-medium uppercase tracking-wide text-[#9b6a43]">Mohammed suggests</div>
            <div className="truncate text-sm font-semibold text-[#22304d]">{missionTitle(top)}</div>
            <div className="truncate text-xs tabular-nums text-slate-500">{top.weight_kd ? `${kd0(top.weight_kd)} at stake · ` : ''}{num(todo)} missions to do</div>
          </div>
        </button>
      )}

      <div className="absolute bottom-0 right-0 z-30 m-3 flex flex-col gap-1.5" style={{ marginBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}>
        <button onClick={() => game.current?.zoomBy(1.25)} aria-label="Zoom in" className="grid h-10 w-10 place-items-center rounded-full bg-white text-[#22304d] shadow-lg"><Plus size={18} /></button>
        <button onClick={() => game.current?.zoomBy(0.8)} aria-label="Zoom out" className="grid h-10 w-10 place-items-center rounded-full bg-white text-[#22304d] shadow-lg"><Minus size={18} /></button>
      </div>

      {/* details: a side panel on wide screens, a sheet from the bottom on phones */}
      {view && snap && (
        <aside ref={panelRef} className="tk-sheet-enter absolute inset-x-0 bottom-0 z-40 flex max-h-[60%] flex-col rounded-t-3xl bg-white shadow-2xl sm:inset-x-auto sm:bottom-3 sm:right-3 sm:top-3 sm:max-h-none sm:w-[400px] sm:rounded-3xl"
          style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
          <div className="flex items-center gap-1 px-3 pt-2.5 sm:pt-3">
            <div className="absolute left-1/2 top-1.5 h-1 w-10 -translate-x-1/2 rounded-full bg-slate-200 sm:hidden" />
            {stack.length > 1 && (
              <button onClick={() => setStack((s) => s.slice(0, -1))} aria-label="Back" className="grid h-8 w-8 place-items-center rounded-full text-slate-500 hover:bg-slate-100"><ChevronLeft size={18} /></button>
            )}
            <button onClick={closePanel} aria-label="Close" className="ml-auto grid h-8 w-8 place-items-center rounded-full text-slate-500 hover:bg-slate-100"><X size={18} /></button>
          </div>
          <div className={`${stack.length > 1 ? '' : '-mt-6 '}overflow-y-auto overscroll-contain px-5 pb-6 pt-1 select-text`}>
            {busy && !snap ? <Loading /> : <PanelBody view={view} ctx={{ s: snap, open, refresh }} cabinets={cabinets} />}
          </div>
        </aside>
      )}
    </div>
  );
}

function Kpi({ label, value, sub, onClick }: { label: string; value: string; sub: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="shrink-0 rounded-xl bg-white/95 px-3 py-1.5 text-left shadow-md">
      <div className="text-[10px] font-medium uppercase tracking-wide text-[#9b6a43]">{label}</div>
      <div className="text-sm font-semibold tabular-nums text-[#22304d]">{value}</div>
      <div className="text-[10px] text-slate-500">{sub}</div>
    </button>
  );
}
