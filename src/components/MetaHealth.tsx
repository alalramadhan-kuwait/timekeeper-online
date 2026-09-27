import { AlertTriangle, CheckCircle2, Clock, Coins } from 'lucide-react';
import { whenSynced, type MetaSyncState, type TrackingPixel } from '../lib/metaAds';

/**
 * Three facts that decide whether anything on the Meta pages can be trusted,
 * said before the figures rather than after them:
 *
 *  - whether purchases are reaching Meta, and in a form it can tie to an ad;
 *  - that Meta's "day" is not Kuwait's day;
 *  - what rate turns Meta's USD into KD, and where it came from.
 */
export function MetaHealth({ sync }: { sync: MetaSyncState | null }) {
  if (!sync) return null;
  return (
    <div className="grid gap-3 lg:grid-cols-3 mb-5">
      <Tracking sync={sync} />
      <TimeZone tz={sync.timezone_name ?? null} />
      <Rate sync={sync} />
    </div>
  );
}

/* ── purchase tracking ───────────────────────────────────────────────────── */

/** Meta's quality answer for one event, if it gave one. */
interface EventQuality {
  event_name?: string;
  event_match_quality?: {
    composite_score?: number;
    match_key_feedback?: { identifier?: string; coverage?: { percentage?: number } }[];
  };
}
const qualityFor = (px: TrackingPixel, event: string): EventQuality | null => {
  const q = (px as TrackingPixel & { quality?: unknown }).quality;
  const list = Array.isArray(q) ? (q as EventQuality[]) : [];
  return list.find((e) => e.event_name === event) ?? null;
};
const coverage = (q: EventQuality | null, id: string): number | null => {
  const hit = q?.event_match_quality?.match_key_feedback?.find((k) => k.identifier === id);
  return hit?.coverage?.percentage ?? null;
};

/** The pixel the website's purchases go to: the one that received any. */
const mainPixel = (pixels: TrackingPixel[]) =>
  [...pixels].sort((a, b) => (b.events_7d?.Purchase ?? 0) - (a.events_7d?.Purchase ?? 0)
    || total(b) - total(a))[0] ?? null;
const total = (p: TrackingPixel) => Object.values(p.events_7d ?? {}).reduce((t, n) => t + n, 0);
const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

/*
 * The finding this panel keeps in front of people (26 Sep): purchases reached
 * the Shopify pixel with value and currency, match quality 7.8/10, and every
 * sales ad set optimised for them — yet Meta credited none to an ad after
 * 10 Aug. Meta's own quality report showed why: no purchase carried the
 * ad-click ID (fbc), which 43% of add-to-carts and 58% of checkouts did. A
 * purchase Meta cannot tie to a click is a purchase no ad gets credit for.
 */
/** Purchase tracking in one verdict — shared by this panel and the
 *  Marketing Overview's health dot so the two never disagree. */
export function trackingState(sync: MetaSyncState | null) {
  const px = mainPixel(sync?.tracking?.pixels ?? []);
  if (!px) return null;
  const purchases = px.events_7d?.Purchase ?? 0;
  const pSources = px.purchase_sources ?? {};
  const pBrowser = pct(pSources.BROWSER ?? 0, (pSources.BROWSER ?? 0) + (pSources.SERVER ?? 0));
  const q = qualityFor(px, 'Purchase');
  const score = q?.event_match_quality?.composite_score ?? null;
  /* Meta lists an identifier only when some events carry it, so a purchase
     report without fbc means none carried the ad-click ID — 0%, not unknown. */
  const fbc = q ? (coverage(q, 'fbc') ?? 0) : null;
  const checkoutFbc = coverage(qualityFor(px, 'InitiateCheckout'), 'fbc');
  const weak = (fbc !== null && fbc < 30) || (fbc === null && pBrowser < 50);
  const tone: 'rose' | 'amber' | 'emerald' = purchases === 0 ? 'rose' : weak ? 'amber' : 'emerald';
  const title = purchases === 0 ? 'No purchases reach Meta'
    : weak ? 'Meta can’t link sales to ads'
    : 'Purchase tracking works';
  return { purchases, score, fbc, checkoutFbc, tone, title };
}

function Tracking({ sync }: { sync: MetaSyncState }) {
  const t = trackingState(sync);
  if (!t) {
    return (
      <Panel tone="slate" icon={<Clock size={16} />} title="Purchase tracking">
        Not checked yet (checked every morning).
      </Panel>
    );
  }
  const { purchases, score, fbc, checkoutFbc, tone, title } = t;

  return (
    <Panel tone={tone} icon={tone === 'emerald' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />} title={title}>
      <ul className="space-y-0.5">
        <li><b className="tabular-nums">{purchases}</b> purchases in 7 days{score !== null && <> · quality <b className="tabular-nums">{score}/10</b></>}</li>
        {purchases > 0 && fbc !== null && (
          <li>Linked to an ad click: <b className="tabular-nums">{fbc}%</b>{checkoutFbc !== null && <> (checkouts <b className="tabular-nums">{checkoutFbc}%</b>)</>}</li>
        )}
      </ul>
      {tone === 'amber' && (
        <p className="mt-2"><b>Fix:</b> Shopify → Facebook &amp; Instagram → Settings → data sharing: <b>Maximum</b>.</p>
      )}
      <p className="mt-1 text-[11px] opacity-70">Checked {whenSynced(sync.tracking_checked_at)}.</p>
    </Panel>
  );
}

/* ── time zone ───────────────────────────────────────────────────────────── */

/** Hours the account's zone sits behind Kuwait, today (it moves with US
 *  daylight saving: 11 in summer, 10 in winter). */
export function hoursBehindKuwait(tz: string | null, at = new Date()): number | null {
  if (!tz) return null;
  try {
    const clock = (zone: string) => {
      const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
        timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
      }).formatToParts(at).map((x) => [x.type, x.value]));
      return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
    };
    return Math.round((clock('Asia/Kuwait') - clock(tz)) / 3_600_000);
  } catch {
    return null;
  }
}

function TimeZone({ tz }: { tz: string | null }) {
  const behind = hoursBehindKuwait(tz);
  const city = tz ? tz.split('/').pop()!.replace(/_/g, ' ') : null;
  return (
    <Panel tone="slate" icon={<Clock size={16} />} title={`Meta days: ${city ?? 'unknown'} time`}>
      {tz && behind !== null
        ? <>{behind}h behind Kuwait — a Meta day starts {String(behind).padStart(2, '0')}:00 here.</>
        : 'Not read yet.'}
    </Panel>
  );
}

/* ── currency ────────────────────────────────────────────────────────────── */

function Rate({ sync }: { sync: MetaSyncState }) {
  return (
    <Panel tone="slate" icon={<Coins size={16} />} title={sync.kwd_per_usd ? `${sync.kwd_per_usd} KD per USD` : 'No KD rate set'}>
      Meta bills in {sync.currency ?? 'USD'}. {sync.rate_auto === false ? 'Pinned in Settings.' : 'Updated daily.'}
    </Panel>
  );
}

/* ── frame ───────────────────────────────────────────────────────────────── */

const TONES = {
  emerald: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  amber: 'border-amber-200 bg-amber-50 text-amber-900',
  rose: 'border-rose-200 bg-rose-50 text-rose-900',
  slate: 'border-slate-200 bg-white text-slate-700',
} as const;

function Panel({ tone, icon, title, children }: {
  tone: keyof typeof TONES; icon: React.ReactNode; title: string; children: React.ReactNode;
}) {
  return (
    <div className={`rounded-xl border px-4 py-3 text-xs leading-relaxed ${TONES[tone]}`}>
      <p className="flex items-center gap-1.5 text-sm font-semibold mb-1">{icon}{title}</p>
      {children}
    </div>
  );
}
