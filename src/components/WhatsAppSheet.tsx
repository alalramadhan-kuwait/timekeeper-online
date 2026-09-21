import { useEffect, useMemo, useState } from 'react';
import { MessageCircle, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getMessageTemplates, getRosterEmployees, logWhatsAppHandoff, type MessageTemplate } from '../lib/customers';
import { renderTemplate, greetingName, whatsappLink, type TemplateKey, type TemplateLang } from '../shared/messageRules';

export interface WhatsAppTarget { customerId: string; name: string | null; phone: string | null }

/**
 * The WhatsApp handoff, back-office edition. Same rules as the shop app's:
 * a template in English or Arabic, filled in and shown to read first; the
 * handoff is recorded before WhatsApp opens; nothing is sent from here and
 * nothing is marked contacted. An owner must name the salesperson the
 * message is from — the owner's account is not a person on the floor.
 */
export function WhatsAppSheet({ target, caseId, product, store, defaultTemplate = 'general_followup', onClose, onOpened }: {
  target: WhatsAppTarget; caseId?: string | null; product?: string | null; store?: string | null;
  defaultTemplate?: TemplateKey; onClose: () => void; onOpened?: () => void;
}) {
  const { role, profile } = useAuth();
  const mustName = role === 'admin' || role === 'staff';
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [roster, setRoster] = useState<Map<string, string>>(new Map());
  const [sender, setSender] = useState(mustName ? '' : (profile?.sales_name ?? profile?.full_name ?? ''));
  const [key, setKey] = useState<string>(defaultTemplate);
  const [lang, setLang] = useState<TemplateLang>('en');
  const [text, setText] = useState('');
  const [edited, setEdited] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    void getMessageTemplates().then(setTemplates).catch(() => setTemplates([]));
    if (mustName) void getRosterEmployees().then(setRoster).catch(() => setRoster(new Map()));
  }, [mustName]);

  const keys = useMemo(() => Array.from(new Set(templates.map(t => t.key))), [templates]);
  const titleOf = (k: string) => templates.find(t => t.key === k && t.lang === 'en')?.title ?? k;
  const current = templates.find(t => t.key === key && t.lang === lang) ?? null;
  const rendered = useMemo(() => current ? renderTemplate(current.body, {
    first_name: greetingName(target.name), salesperson: sender || null, store: store ?? null, product: product ?? null,
  }) : '', [current, target.name, sender, store, product]);
  useEffect(() => { if (!edited) setText(rendered); }, [rendered, edited]);

  const link = whatsappLink(target.phone, text);
  const can = !!link && text.trim().length > 0 && (!mustName || !!sender);

  async function open() {
    if (!link) return;
    setBusy(true); setErr('');
    try {
      let employeeId: string | null = null;
      if (mustName) {
        employeeId = roster.get(sender) ?? null;
        if (!employeeId) throw new Error('Choose the salesperson this message is from.');
      }
      await logWhatsAppHandoff(target.customerId, key, lang, employeeId, caseId ?? null);
      const w = window.open(link, '_blank', 'noopener');
      if (!w) window.location.href = link;
      onOpened?.(); onClose();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not open WhatsApp.'); }
    finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4" onClick={() => !busy && onClose()}>
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-md max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-start gap-3 px-5 py-4 border-b border-slate-100">
          <MessageCircle size={20} className="text-emerald-600 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-slate-900">WhatsApp {target.name || 'the customer'}</p>
            <p className="text-xs text-slate-500">{target.phone ?? 'No number that can be messaged'}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
        </div>
        <div className="px-5 py-4 space-y-4">
          {mustName && (
            <label className="block text-sm">
              <span className="text-slate-600 text-xs font-medium">From</span>
              <select value={sender} onChange={e => { setSender(e.target.value); setEdited(false); }} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm">
                <option value="">— Choose the salesperson —</option>
                {Array.from(roster.keys()).map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
          )}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-slate-600 text-xs font-medium">Message</span>
              <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs font-semibold">
                {(['en', 'ar'] as const).map(l => (
                  <button key={l} type="button" onClick={() => { setLang(l); setEdited(false); }}
                    className={`px-3 py-1 ${lang === l ? 'bg-slate-900 text-white' : 'text-slate-600'}`}>{l === 'en' ? 'English' : 'العربية'}</button>
                ))}
              </div>
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-2">
              {keys.map(k => (
                <button key={k} type="button" onClick={() => { setKey(k); setEdited(false); }}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border ${key === k ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200'}`}>{titleOf(k)}</button>
              ))}
            </div>
            <textarea value={text} onChange={e => { setText(e.target.value); setEdited(true); }} rows={6} dir={lang === 'ar' ? 'rtl' : 'ltr'}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm leading-relaxed resize-none" />
            <p className="text-[11px] text-slate-400 mt-1">Read it before you send. WhatsApp opens with this typed in; nothing goes until Send is pressed there.</p>
          </div>
          {err && <p className="text-sm text-rose-600">{err}</p>}
          <button type="button" disabled={!can || busy} onClick={() => void open()}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 text-white font-semibold disabled:opacity-40">
            <MessageCircle size={18} /> {busy ? 'Opening…' : 'Open WhatsApp'}
          </button>
          {caseId && <p className="text-[11px] text-slate-400 text-center">This does not mark the follow-up as contacted.</p>}
        </div>
      </div>
    </div>
  );
}
