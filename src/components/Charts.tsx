// Lightweight, dependency-free SVG charts for the owner dashboard. Kept intentionally
// simple: a line chart for trends and a horizontal bar chart for comparisons. Both are
// responsive (viewBox + w-full) and match the app's slate/white light theme.
import { Link } from 'react-router-dom';

export interface Point { label: string; value: number }
export interface Bar { label: string; value: number; target?: number | null; color?: string }

const fmtInt = (n: number) => Math.round(n).toLocaleString();

/** Card wrapper so charts sit consistently under a section's KPI cards. */
export function ChartCard({ title, hint, link, children }: {
  title: string; hint?: string; link?: string; children: React.ReactNode;
}) {
  const head = (
    <div className="flex items-baseline justify-between gap-2 mb-2">
      <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
      {hint && <span className="text-xs text-slate-400">{hint}</span>}
    </div>
  );
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
      {link ? <Link to={link} className="block hover:opacity-90">{head}</Link> : head}
      {children}
    </div>
  );
}

function Empty({ height }: { height: number }) {
  return (
    <div className="flex items-center justify-center text-xs text-slate-400" style={{ height }}>
      No data yet
    </div>
  );
}

/** Trend line with a soft area fill and endpoint markers. */
export function LineChart({ data, height = 120, color = '#0f172a', fmt = fmtInt }: {
  data: Point[]; height?: number; color?: string; fmt?: (n: number) => string;
}) {
  if (!data.length) return <Empty height={height} />;
  const W = 600, H = height, padX = 8, padT = 12, padB = 22;
  const values = data.map((d) => d.value);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const x = (i: number) => padX + (i * (W - padX * 2)) / Math.max(1, data.length - 1);
  const y = (v: number) => padT + (1 - (v - min) / span) * (H - padT - padB);
  const line = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(d.value).toFixed(1)}`).join(' ');
  const area = `${line} L ${x(data.length - 1).toFixed(1)} ${(H - padB).toFixed(1)} L ${x(0).toFixed(1)} ${(H - padB).toFixed(1)} Z`;
  const last = data[data.length - 1];
  // show at most ~6 x labels so they don't collide
  const step = Math.max(1, Math.ceil(data.length / 6));

  return (
    <div>
      <div className="flex items-baseline gap-2 mb-1">
        <span className="text-lg font-bold text-slate-800">{fmt(last.value)}</span>
        <span className="text-xs text-slate-400">latest · {last.label}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height }} preserveAspectRatio="none">
        <path d={area} fill={color} opacity={0.07} />
        <path d={line} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" />
        {data.map((d, i) => (
          <circle key={i} cx={x(i)} cy={y(d.value)} r={i === data.length - 1 ? 3 : 0} fill={color}>
            <title>{d.label}: {fmt(d.value)}</title>
          </circle>
        ))}
        {data.map((d, i) => (i % step === 0 || i === data.length - 1) ? (
          <text key={`t${i}`} x={x(i)} y={H - 6} textAnchor="middle" className="fill-slate-400" fontSize={10}>{d.label}</text>
        ) : null)}
      </svg>
    </div>
  );
}

/** Horizontal bars — best for comparisons with wordy labels (brands, statuses, outlets). */
export function BarChart({ data, fmt = fmtInt, barColor = '#334155', maxBars = 8 }: {
  data: Bar[]; fmt?: (n: number) => string; barColor?: string; maxBars?: number;
}) {
  const rows = [...data].sort((a, b) => b.value - a.value).slice(0, maxBars);
  if (!rows.length || rows.every((r) => r.value === 0)) return <Empty height={100} />;
  const max = Math.max(...rows.map((r) => Math.max(r.value, r.target ?? 0)), 1);
  return (
    <div className="space-y-2">
      {rows.map((r) => {
        const pct = (r.value / max) * 100;
        const tPct = r.target != null && r.target > 0 ? (r.target / max) * 100 : null;
        const hitTarget = r.target != null && r.target > 0 && r.value >= r.target;
        return (
          <div key={r.label} className="flex items-center gap-2">
            <div className="w-24 sm:w-28 shrink-0 text-xs text-slate-500 truncate" title={r.label}>{r.label}</div>
            <div className="flex-1 relative h-5 rounded bg-slate-100 overflow-hidden">
              <div className="h-full rounded" style={{ width: `${pct}%`, background: r.color ?? barColor }} />
              {tPct != null && (
                <div className="absolute top-0 h-full border-l-2 border-dashed"
                  style={{ left: `${Math.min(tPct, 100)}%`, borderColor: hitTarget ? '#059669' : '#f59e0b' }}
                  title={`Target: ${fmt(r.target!)}`} />
              )}
            </div>
            <div className="w-20 shrink-0 text-right text-xs font-semibold text-slate-700 tabular-nums">{fmt(r.value)}</div>
          </div>
        );
      })}
    </div>
  );
}
