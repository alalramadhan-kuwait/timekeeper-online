import { useEffect, useState } from 'react';
import { Modal } from './ui';
import releases from '../releases.json';
import pkg from '../../package.json';

/**
 * Which version this is, and what changed in it.
 *
 * The number comes from package.json and the notes from src/releases.json; the
 * build refuses to ship if the two disagree (scripts/release-check.mjs), so the
 * number on screen always has words behind it. The seven characters after it
 * are the exact build, set by CI on every deploy.
 *
 * A dot marks a version this device has not opened the notes for yet. The key
 * is prefixed because both apps are served from the same address, and an
 * unprefixed one would let the shop app's "seen" silence this one's.
 */

interface Release { version: string; date: string; title: string; changes: string[] }
const RELEASES = releases as Release[];
const SEEN_KEY = 'tk:whatsNewSeen';
const SEEN_EVENT = 'tk:whatsnew-seen';

export const APP_VERSION: string = pkg.version;
export const versionLabel = () => `v${APP_VERSION}${__BUILD_SHA__ ? ` · ${__BUILD_SHA__}` : ''}`;

function readSeen(): string | null {
  try { return localStorage.getItem(SEEN_KEY); } catch { return null; }
}

/** True until this device has opened the notes for the running version. */
export function useUnseenRelease(): boolean {
  const [seen, setSeen] = useState(readSeen);
  useEffect(() => {
    const sync = () => setSeen(readSeen());
    window.addEventListener(SEEN_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => { window.removeEventListener(SEEN_EVENT, sync); window.removeEventListener('storage', sync); };
  }, []);
  return seen !== APP_VERSION;
}

function markSeen() {
  try { localStorage.setItem(SEEN_KEY, APP_VERSION); } catch { /* private mode: the dot simply stays */ }
  window.dispatchEvent(new Event(SEEN_EVENT));
}

const day = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

export function WhatsNewModal({ onClose }: { onClose: () => void }) {
  useEffect(() => { markSeen(); }, []);
  return (
    <Modal title="What's new" onClose={onClose}>
      <p className="text-xs text-slate-500 mb-5">
        You are on <span className="font-semibold text-slate-700 tabular-nums">{versionLabel()}</span>
      </p>
      <div className="space-y-7 max-w-2xl">
        {RELEASES.map((r, i) => (
          <section key={r.version}>
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className={`text-sm font-bold tabular-nums ${i === 0 ? 'text-amber-600' : 'text-slate-700'}`}>v{r.version}</span>
              <span className="text-xs text-slate-400">{day(r.date)}</span>
              {r.version === APP_VERSION && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200">This device</span>
              )}
            </div>
            <h3 className="font-semibold text-slate-900 mt-0.5">{r.title}</h3>
            <ul className="mt-2 space-y-1.5">
              {r.changes.map((c) => (
                <li key={c} className="flex gap-2 text-sm text-slate-600 leading-snug">
                  <span className="mt-[7px] w-1 h-1 rounded-full bg-slate-400 shrink-0" aria-hidden />
                  <span>{c}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Modal>
  );
}

/**
 * The version line: tap it for the notes. `tone` suits a dark or light
 * background; `compact` drops the build code where room is short (the phone
 * header also carries the menu, the install button and the bell). The full
 * line is always one tap away, on the notes themselves.
 */
export function VersionChip({ className = '', tone = 'dark', compact = false }: { className?: string; tone?: 'dark' | 'light'; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const unseen = useUnseenRelease();
  const hover = tone === 'dark' ? 'hover:bg-slate-800 hover:text-slate-200' : 'hover:bg-white/10';
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        aria-label={`Version ${APP_VERSION}${unseen ? ', new, see what changed' : ', see what changed'}`}
        className={`relative inline-flex items-center gap-1.5 px-1.5 py-1 -mx-1.5 rounded-md transition-colors ${hover} ${className}`}>
        <span className="leading-none tabular-nums whitespace-nowrap">{compact ? `v${APP_VERSION}` : versionLabel()}</span>
        {unseen && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" aria-hidden />}
      </button>
      {open && <WhatsNewModal onClose={() => setOpen(false)} />}
    </>
  );
}
