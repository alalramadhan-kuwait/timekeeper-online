export function formatKD(amount: number): string {
  return amount.toFixed(3).replace(/(\.\d*[1-9])0+$/, '$1').replace(/\.0+$/, '');
}

export function formatKDCompact(amount: number): string {
  if (amount >= 1000) return Math.round(amount).toLocaleString('en-US');
  if (amount >= 100) return String(Math.round(amount));
  return formatKD(amount);
}

export function fmtDate(d: string | null | undefined): string {
  if (!d) return '—';
  return d;
}
