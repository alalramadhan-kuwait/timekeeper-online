/**
 * Where the page was scrolled, per history entry, so Back lands where you were.
 *
 * Going to another page starts it at the top. Going Back (or Forward) puts the
 * page back where it was left: the owner scrolls Today to the Needs card, opens
 * a follow-up, presses Back, and is at the Needs card again rather than at the
 * top of Today.
 *
 * The browser's own restoration cannot do this here: the pages fill in after
 * their data arrives, so at the moment of Back the page is too short to scroll
 * to the old position. This keeps trying, frame by frame, until the page is
 * tall enough (for up to four seconds), and stops at once if the person starts
 * scrolling themselves.
 *
 * A change that keeps the page (?sheet= opening a branch, a filter in the URL)
 * leaves the scroll alone.
 */
import { useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

const saved = new Map<string, number>();
const RESTORE_FOR_MS = 4000;

export function useScrollMemory(): void {
  const location = useLocation();
  const navType = useNavigationType();
  const keyRef = useRef(location.key);
  const pathRef = useRef(location.pathname);

  useEffect(() => {
    try { window.history.scrollRestoration = 'manual'; } catch { /* not supported: nothing to turn off */ }
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => { raf = 0; saved.set(keyRef.current, window.scrollY); });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { window.removeEventListener('scroll', onScroll); cancelAnimationFrame(raf); };
  }, []);

  useLayoutEffect(() => {
    const samePage = pathRef.current === location.pathname;
    keyRef.current = location.key;
    pathRef.current = location.pathname;
    /* Same page: a sheet or a filter. The page did not move, and a sheet locks
       the scroll, so this entry is where the page is now. */
    if (samePage) { if (!saved.has(location.key)) saved.set(location.key, window.scrollY); return; }
    if (navType !== 'POP') { window.scrollTo(0, 0); return; }

    const y = saved.get(location.key) ?? 0;
    if (y <= 0) { window.scrollTo(0, 0); return; }
    let stopped = false;
    const stop = () => { stopped = true; };
    const evs = ['wheel', 'touchstart', 'keydown'] as const;
    evs.forEach((e) => window.addEventListener(e, stop, { passive: true, once: true }));
    const t0 = performance.now();
    let raf = 0;
    const tick = () => {
      if (stopped) return;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      window.scrollTo(0, Math.min(y, Math.max(0, max)));
      if (max >= y || performance.now() - t0 > RESTORE_FOR_MS) return;
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      evs.forEach((e) => window.removeEventListener(e, stop));
    };
  }, [location.key]); // eslint-disable-line react-hooks/exhaustive-deps
}
