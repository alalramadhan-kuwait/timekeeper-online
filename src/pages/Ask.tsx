import { useEffect, useRef, useState } from 'react';
import { MessageSquare, Send, Plus, ThumbsUp, ThumbsDown, AlertTriangle, Lock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { Spinner } from '../components/ui';

/**
 * Ask: the owners' stock analyst. Answers come from the stock-assistant backend,
 * which only runs fixed calculations; this screen never sees an API key or
 * queries stock itself. The strip above each answer (period, freshness, gaps) is
 * written by the backend, not the model.
 */

interface Strip {
  period?: string | null; compared_with?: string | null; sales_through?: string | null;
  stock_as_of?: string | null; stock_basis?: string | null;
  filters?: Record<string, string> | null; notes?: string[];
}
interface Msg {
  id?: string; role: 'user' | 'assistant'; content: string; strip?: Strip | null;
  model?: string | null; verdict?: 'right' | 'wrong' | null; pending?: boolean;
}
interface Status { enabled: boolean; has_key: boolean; budget?: { warn: boolean; blocked: boolean } }

const SUGGESTIONS = [
  'How much stock do we have, owned vs consignment?',
  'What should I reorder this month?',
  'Why did Nivada sales drop?',
  'شنو أكثر شي انباع آخر ٣ شهور؟',
  'عندنا Hoffman Panda؟',
  'لو عندي ٥٠٠٠ دينار شنو أشتري؟',
];

const REASONS: { key: string; label: string }[] = [
  { key: 'wrong_number', label: 'Wrong number' },
  { key: 'wrong_reason', label: 'Wrong reason' },
  { key: 'misunderstood', label: 'Misunderstood me' },
  { key: 'bad_advice', label: 'Bad advice' },
];

async function invokeError(error: unknown): Promise<string> {
  const ctx = (error as { context?: Response })?.context;
  if (ctx && typeof ctx.json === 'function') {
    try { const b = await ctx.json(); if (b?.error) return b.error; } catch { /* not JSON */ }
  }
  return 'Something went wrong. Try again.';
}

export default function AskPage() {
  const { user } = useAuth();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  async function loadLatest() {
    const { data: conv } = await supabase.from('ai_conversations').select('id')
      .order('updated_at', { ascending: false }).limit(1).maybeSingle();
    if (!conv) return;
    const { data: rows } = await supabase.from('ai_messages').select('id, role, content, checks, model, created_at')
      .eq('conversation_id', conv.id).order('created_at');
    const ids = (rows ?? []).filter((r) => r.role === 'assistant').map((r) => r.id);
    const { data: fb } = ids.length
      ? await supabase.from('ai_feedback').select('message_id, verdict').in('message_id', ids)
      : { data: [] as { message_id: string; verdict: 'right' | 'wrong' }[] };
    const verdicts = new Map((fb ?? []).map((f) => [f.message_id, f.verdict]));
    setConversationId(conv.id);
    setMessages((rows ?? []).map((r) => ({
      id: r.id, role: r.role, content: r.content, model: r.model,
      strip: (r.checks as { strip?: Strip } | null)?.strip ?? null,
      verdict: verdicts.get(r.id) ?? null,
    })));
  }

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: ok } = await supabase.rpc('stock_ai_allowed');
      setAllowed(!!ok);
      if (!ok) return;
      const { data: st } = await supabase.functions.invoke('stock-assistant', { body: { action: 'status' } });
      if (st?.ok) setStatus(st);
      await loadLatest();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages.length, busy]);

  function newChat() {
    setConversationId(null); setMessages([]); setError(null); setText('');
  }

  async function ask(q?: string) {
    const question = (q ?? text).trim();
    if (!question || busy) return;
    setText(''); setError(null); setBusy(true);
    setMessages((m) => [...m, { role: 'user', content: question }]);
    const { data, error: err } = await supabase.functions.invoke('stock-assistant', {
      body: { action: 'ask', conversation_id: conversationId, message: question },
    });
    setBusy(false);
    if (err || !data?.ok) {
      setError(err ? await invokeError(err) : (data?.error ?? 'Something went wrong. Try again.'));
      if (data?.conversation_id) setConversationId(data.conversation_id);
      return;
    }
    setConversationId(data.conversation_id);
    setMessages((m) => [...m, { id: data.message_id, role: 'assistant', content: data.reply, strip: data.strip, model: data.model }]);
  }

  if (allowed === null) return <Spinner />;
  if (!allowed) {
    return (
      <div className="max-w-md mx-auto mt-16 text-center text-slate-500">
        <Lock className="mx-auto mb-3 text-slate-400" size={28} />
        <p>Ask is limited to the owners.</p>
      </div>
    );
  }

  const off = status && !status.enabled;
  return (
    <div className="max-w-3xl mx-auto flex flex-col" style={{ minHeight: 'calc(100dvh - 7rem)' }}>
      <div className="flex items-center gap-3 mb-3">
        <MessageSquare size={20} className="text-amber-500" />
        <div className="flex-1">
          <h1 className="text-xl font-bold text-slate-800 leading-tight">Ask</h1>
          <p className="text-xs text-slate-500">Stock and sales from Lightspeed, in English or Arabic</p>
        </div>
        {messages.length > 0 && (
          <button onClick={newChat} className="flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">
            <Plus size={15} /> New
          </button>
        )}
      </div>

      {off && (
        <div className="mb-3 flex gap-2 items-start rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{status!.has_key ? 'Ask is being tested and is not switched on yet.' : 'Ask is waiting for its AI key to be set up.'}</span>
        </div>
      )}
      {status?.budget?.warn && !status.budget.blocked && (
        <div className="mb-3 text-xs text-amber-700">This month's AI budget is 80% used.</div>
      )}

      <div className="flex-1 space-y-4 pb-4">
        {messages.length === 0 && !busy && (
          <div className="pt-6">
            <p className="text-sm text-slate-500 mb-3">Try:</p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} dir="auto" disabled={!!off} onClick={() => ask(s)}
                  className="text-sm px-3 py-2 rounded-full bg-white border border-slate-200 text-slate-700 hover:border-amber-300 disabled:opacity-50">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => m.role === 'user'
          ? <div key={m.id ?? `u${i}`} dir="auto" className="ml-auto max-w-[85%] w-fit rounded-2xl rounded-br-sm bg-slate-800 text-white px-4 py-2.5 text-[15px] whitespace-pre-wrap">{m.content}</div>
          : <Answer key={m.id ?? `a${i}`} msg={m} onVerdict={(v) => setMessages((all) => all.map((x) => (x.id === m.id ? { ...x, verdict: v } : x)))} />)}
        {busy && (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <span className="inline-flex gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce" />
              <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:120ms]" />
              <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:240ms]" />
            </span>
            Checking the figures…
          </div>
        )}
        {error && <div className="text-sm text-red-600">{error}</div>}
        <div ref={endRef} />
      </div>

      <form onSubmit={(e) => { e.preventDefault(); ask(); }}
        className="sticky bottom-0 bg-slate-50 pt-2 flex gap-2 items-end" style={{ paddingBottom: 'calc(0.5rem + var(--sa-b, 0px))' }}>
        <textarea id="ask-input" dir="auto" rows={1} value={text} disabled={!!off}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(); } }}
          placeholder={off ? 'Not switched on yet' : 'Ask about stock, sales or what to buy…'}
          className="flex-1 resize-none rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-[16px] max-h-40 focus:outline-none focus:ring-2 focus:ring-amber-300 disabled:bg-slate-100" />
        <button type="submit" disabled={busy || !text.trim() || !!off} aria-label="Send"
          className="h-11 w-11 shrink-0 rounded-xl bg-amber-500 text-white flex items-center justify-center disabled:opacity-40">
          <Send size={18} />
        </button>
      </form>
    </div>
  );
}

function StripLine({ strip }: { strip: Strip }) {
  const fmt = (d?: string | null) => {
    if (!d) return null;
    const t = new Date(d.length > 10 ? d.replace(' ', 'T') + '+03:00' : d + 'T12:00:00+03:00');
    return Number.isNaN(t.getTime()) ? d : t.toLocaleString('en-GB', {
      day: 'numeric', month: 'short', ...(d.length > 10 ? { hour: '2-digit', minute: '2-digit' } : {}), timeZone: 'Asia/Kuwait' });
  };
  const parts = [
    strip.period && `Period ${strip.period.replace(' to ', ' – ')}`,
    strip.compared_with && `vs ${strip.compared_with.replace(' to ', ' – ')}`,
    strip.sales_through && `Sales to ${fmt(strip.sales_through)}`,
    strip.stock_as_of && `Stock ${fmt(strip.stock_as_of)}${strip.stock_basis === 'reconstructed' ? ' (rebuilt)' : ''}`,
    ...Object.entries(strip.filters ?? {}).map(([k, v]) => `${k.replace('_', ' ')}: ${v}`),
  ].filter(Boolean);
  if (!parts.length && !strip.notes?.length) return null;
  return (
    <div className="text-[11px] leading-snug text-slate-500 mb-2 border-b border-slate-100 pb-2">
      <div>{parts.join(' · ')}</div>
      {strip.notes?.map((n) => <div key={n} className="text-amber-700">Estimated / missing: {n}</div>)}
    </div>
  );
}

function Answer({ msg, onVerdict }: { msg: Msg; onVerdict: (v: 'right' | 'wrong') => void }) {
  const [asking, setAsking] = useState(false);
  const [reasons, setReasons] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [saved, setSaved] = useState<string | null>(null);

  async function send(verdict: 'right' | 'wrong', rs: string[] = [], n = '') {
    if (!msg.id) return;
    const row = { verdict, reasons: rs, note: n.trim() || null };
    const ins = await supabase.from('ai_feedback').insert({ message_id: msg.id, ...row });
    if (ins.error?.code === '23505') await supabase.from('ai_feedback').update(row).eq('message_id', msg.id);
    else if (ins.error) { setSaved('Could not save'); return; }
    onVerdict(verdict); setAsking(false); setSaved('Thanks, noted');
  }

  return (
    <div className="max-w-[95%] rounded-2xl rounded-bl-sm bg-white border border-slate-200 px-4 py-3">
      {msg.strip && <StripLine strip={msg.strip} />}
      <div dir="auto" className="text-[15px] text-slate-800"><Rich text={msg.content} /></div>
      {msg.model === 'data-only' && (
        <div className="mt-2 text-[11px] text-amber-700">Shown as the raw figures: no reading passed the checks.</div>
      )}
      {msg.id && (
        <div className="mt-3 flex items-center gap-1 text-slate-400">
          <button aria-label="Right" onClick={() => send('right')}
            className={`p-1.5 rounded-lg hover:bg-slate-50 ${msg.verdict === 'right' ? 'text-emerald-600' : ''}`}><ThumbsUp size={15} /></button>
          <button aria-label="Wrong" onClick={() => setAsking((a) => !a)}
            className={`p-1.5 rounded-lg hover:bg-slate-50 ${msg.verdict === 'wrong' ? 'text-red-600' : ''}`}><ThumbsDown size={15} /></button>
          {saved && <span className="text-[11px] ml-1">{saved}</span>}
        </div>
      )}
      {asking && (
        <div className="mt-2 space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {REASONS.map((r) => (
              <button key={r.key} onClick={() => setReasons((p) => p.includes(r.key) ? p.filter((x) => x !== r.key) : [...p, r.key])}
                className={`text-xs px-2.5 py-1 rounded-full border ${reasons.includes(r.key) ? 'bg-red-50 border-red-300 text-red-700' : 'border-slate-200 text-slate-600'}`}>
                {r.label}
              </button>
            ))}
          </div>
          <textarea id={`fb-${msg.id}`} dir="auto" rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="What was wrong? (optional)"
            className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
          <button onClick={() => send('wrong', reasons, note)}
            className="text-sm px-3 py-1.5 rounded-lg bg-slate-800 text-white">Send</button>
        </div>
      )}
    </div>
  );
}

/** A small, safe renderer for the answer's markdown: headings, bold, bullets and tables. */
function Rich({ text }: { text: string }) {
  const lines = text.split('\n');
  const out: JSX.Element[] = [];
  let i = 0;
  const inline = (s: string, k: string | number) => {
    const parts = s.split(/(\*\*[^*]+\*\*)/g);
    return <span key={k}>{parts.map((p, j) => p.startsWith('**') && p.endsWith('**') ? <strong key={j}>{p.slice(2, -2)}</strong> : p)}</span>;
  };
  while (i < lines.length) {
    const line = lines[i];
    if (/^\s*\|/.test(line)) {
      const rows: string[][] = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) {
        const cells = lines[i].trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
        if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) rows.push(cells);
        i++;
      }
      const [head, ...body] = rows;
      out.push(
        <div key={`t${i}`} className="overflow-x-auto my-2">
          <table className="text-sm border-collapse min-w-full">
            {head && <thead><tr>{head.map((c, j) => <th key={j} className="text-start font-semibold text-slate-600 border-b border-slate-200 px-2 py-1 whitespace-nowrap">{inline(c, j)}</th>)}</tr></thead>}
            <tbody>{body.map((r, ri) => <tr key={ri}>{r.map((c, j) => <td key={j} className="border-b border-slate-100 px-2 py-1 tabular-nums">{inline(c, j)}</td>)}</tr>)}</tbody>
          </table>
        </div>,
      );
      continue;
    }
    if (/^\s*[-*•]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*•]\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*[-*•]\s+/, '')); i++; }
      out.push(<ul key={`u${i}`} className="list-disc ps-5 my-1.5 space-y-0.5">{items.map((it, j) => <li key={j}>{inline(it, j)}</li>)}</ul>);
      continue;
    }
    const h = line.match(/^#{1,4}\s+(.*)/);
    if (h) out.push(<div key={`h${i}`} className="font-semibold text-slate-900 mt-3 mb-1">{inline(h[1], 0)}</div>);
    else if (line.trim()) out.push(<p key={`p${i}`} className="my-1">{inline(line, 0)}</p>);
    i++;
  }
  return <>{out}</>;
}
