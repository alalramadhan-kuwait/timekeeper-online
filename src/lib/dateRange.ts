export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/**
 * A week as a person would write it, not as two ISO dates.
 *
 * "2026-09-12 → 2026-09-18" makes you read eight digits twice to work out that
 * it is one week in September. The parts that are the same are said once:
 *
 *   within a month   12–18 Sep 2026
 *   across months    28 Sep – 4 Oct 2026
 *   across years     28 Dec 2026 – 3 Jan 2027
 *
 * Display only — `anchor`, `days` and every query still use the yyyy-mm-dd
 * strings, which is also why this takes them rather than Date objects and never
 * builds one: no parsing, so no timezone to get wrong.
 */
export const rangeLabel = (a: string, b: string) => {
  const d = (ymd: string) => Number(ymd.slice(8));
  const mon = (ymd: string) => MONTHS[Number(ymd.slice(5, 7)) - 1];
  const yr = (ymd: string) => ymd.slice(0, 4);
  if (yr(a) !== yr(b)) return `${d(a)} ${mon(a)} ${yr(a)} – ${d(b)} ${mon(b)} ${yr(b)}`;
  if (a.slice(5, 7) !== b.slice(5, 7)) return `${d(a)} ${mon(a)} – ${d(b)} ${mon(b)} ${yr(b)}`;
  return `${d(a)}–${d(b)} ${mon(a)} ${yr(a)}`;
};
