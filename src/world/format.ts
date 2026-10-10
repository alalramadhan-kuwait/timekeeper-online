/* Numbers and dates the way the World shows them: Kuwaiti dinars to the fils,
   dates and times in Kuwait. */

export const kd = (n: number | null | undefined, digits = 3) =>
  n === null || n === undefined || Number.isNaN(n)
    ? '—'
    : `${n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })} KD`;

export const kd0 = (n: number | null | undefined) => kd(n, 0);

export const num = (n: number | null | undefined) => (n === null || n === undefined ? '—' : n.toLocaleString('en-US'));

export const day = (d: string | null | undefined) =>
  d ? new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

export const when = (t: string | null | undefined) =>
  t ? new Date(t).toLocaleString('en-GB', {
    timeZone: 'Asia/Kuwait', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  }) : '—';

export const clock = (t: string | null | undefined) =>
  t ? new Date(t).toLocaleTimeString('en-GB', { timeZone: 'Asia/Kuwait', hour: '2-digit', minute: '2-digit', hour12: false }) : '—';

export const plural = (n: number, one: string, many = `${one}s`) => `${num(n)} ${n === 1 ? one : many}`;
