export function formatKD(amount: number): string {
  const stripped = amount.toFixed(3).replace(/(\.\d*[1-9])0+$/, '$1').replace(/\.0+$/, '');
  const dotIdx = stripped.indexOf('.');
  const intPart = (dotIdx === -1 ? stripped : stripped.slice(0, dotIdx))
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return dotIdx === -1 ? intPart : `${intPart}${stripped.slice(dotIdx)}`;
}

export function formatKDCompact(amount: number): string {
  return Math.round(amount).toLocaleString('en-US');
}

export function fmtDate(d: string | null | undefined): string {
  if (!d) return '—';
  return d;
}
