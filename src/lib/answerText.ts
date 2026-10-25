/**
 * The answer as text to paste into WhatsApp or an email: WhatsApp's *bold*,
 * bullets as dots, and each table row on its own line as "first cell — header: value".
 */
export function plainText(md: string): string {
  const bold = (s: string) => s.replace(/\*\*([^*]+)\*\*/g, '*$1*');
  const lines = md.split('\n');
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    if (/^\s*\|/.test(lines[i])) {
      const rows: string[][] = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) {
        const cells = lines[i].trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim().replace(/\*\*/g, ''));
        if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) rows.push(cells);
        i++;
      }
      const [head = [], ...body] = rows;
      if (!body.length) out.push(head.join(' · '));
      for (const r of body) {
        const rest = r.slice(1).map((c, j) => (head[j + 1] ? `${head[j + 1]}: ${c}` : c)).filter((c) => c.trim());
        out.push(`• ${r[0]}${rest.length ? ` — ${rest.join(' · ')}` : ''}`);
      }
      continue;
    }
    const line = lines[i];
    const h = line.match(/^#{1,4}\s+(.*)/);
    if (h) out.push(`*${h[1].replace(/\*\*/g, '')}*`);
    else if (/^\s*[-*•]\s+/.test(line)) out.push(bold(line.replace(/^\s*[-*•]\s+/, '• ')));
    else out.push(bold(line));
    i++;
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
