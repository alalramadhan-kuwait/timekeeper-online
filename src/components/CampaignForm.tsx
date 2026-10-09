import { useEffect, useMemo, useState } from 'react';
import { Modal } from './ui';
import {
  FormOptions, FormProduct, Objective, formOptions, createCampaign,
  UNIT_LABEL, CHANNEL_LABEL, CONTENT_LABEL, OFFER_LABEL, ARRIVAL_LABEL,
} from '../lib/campaigns';

const OBJECTIVE_HINT: Record<Objective, string> = {
  slow_stock: 'Move pieces that are slow or not selling.',
  new_arrivals: 'Introduce pieces that have just come in.',
  best_seller: 'Push what already sells well.',
  brand_awareness: 'Grow attention for a brand, not a sale.',
};
const todayKuwait = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuwait' });
const inDays = (n: number) => new Date(Date.now() + n * 86400_000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kuwait' });

export default function CampaignForm({ myId, onClose, onCreated }: { myId: string; onClose: () => void; onCreated: (id: string) => void }) {
  const [opts, setOpts] = useState<FormOptions | null>(null);
  const [products, setProducts] = useState<FormProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [objective, setObjective] = useState<Objective | ''>('');
  const [title, setTitle] = useState('');
  const [brand, setBrand] = useState('');
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<Map<string, FormProduct>>(new Map());
  const [targetValue, setTargetValue] = useState('');
  const [targetUnit, setTargetUnit] = useState('');
  const [windowDays, setWindowDays] = useState('');
  const [channels, setChannels] = useState<string[]>(['instagram_post']);
  const [contentKind, setContentKind] = useState('');
  const [offer, setOffer] = useState('none');
  const [offerPct, setOfferPct] = useState('');
  const [priority, setPriority] = useState('Normal');
  const [deadline, setDeadline] = useState(inDays(5));
  const [assignee, setAssignee] = useState('');
  const [owner, setOwner] = useState(myId);
  const [budget, setBudget] = useState('');
  const [brief, setBrief] = useState('');

  useEffect(() => { formOptions().then((r) => (r.options ? setOpts(r.options) : setErr(r.error ?? null))); }, []);

  const setting = opts?.objectives.find((o) => o.objective === objective);
  // a new objective brings its own units and window, and products fit it differently
  function chooseObjective(o: Objective) {
    const s = opts?.objectives.find((x) => x.objective === o);
    setObjective(o);
    setTargetUnit(s?.target_units[0] ?? '');
    setWindowDays(String(s?.default_window_days ?? ''));
    setPicked(new Map());
  }

  // products follow the objective, brand and search; each one says whether it fits
  const querying = !!objective && (!!brand || !!search.trim());
  useEffect(() => {
    if (!querying) return;
    let live = true;
    const t = setTimeout(() => {
      setLoadingProducts(true);
      formOptions(objective, brand, search).then((r) => {
        if (!live) return;
        setProducts(r.options?.products ?? []); setLoadingProducts(false);
      });
    }, 300);
    return () => { live = false; clearTimeout(t); };
  }, [querying, objective, brand, search]);

  const field = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400';
  const label = 'block text-sm text-slate-600 mb-1';
  const needsProducts = objective !== '' && objective !== 'brand_awareness';
  const toggle = (p: FormProduct) => setPicked((m) => { const n = new Map(m); if (n.has(p.product_id)) n.delete(p.product_id); else n.set(p.product_id, p); return n; });
  const shown = useMemo(() => {
    const found = querying ? products : [];
    const ids = new Set(found.map((p) => p.product_id));
    return [...[...picked.values()].filter((p) => !ids.has(p.product_id)), ...found];
  }, [products, picked, querying]);

  async function save() {
    setBusy(true); setErr(null);
    const r = await createCampaign({
      objective, title, brand: brand || null, product_ids: [...picked.keys()],
      target_value: targetValue, target_unit: targetUnit, window_days: windowDays,
      channels, content_kind: contentKind || null, offer, offer_pct: offer === 'discount' ? offerPct : null,
      priority, deadline, budget_cap_kd: budget || null, brief,
      assignee_employee_id: assignee && assignee !== 'team' ? assignee : null, assign_to_team: assignee === 'team',
      campaign_owner: owner,
    });
    setBusy(false);
    if (r.error) { setErr(r.error); return; }
    onCreated(r.id!);
  }

  return (
    <Modal title="New campaign" onClose={onClose}>
      {!opts && !err && <p className="text-sm text-slate-500">Loading…</p>}
      {opts && (
        <div className="space-y-5">
          <fieldset>
            <legend className={label}>Objective</legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {opts.objectives.map((o) => (
                <label key={o.objective} className={`rounded-lg border p-3 cursor-pointer text-sm ${objective === o.objective ? 'border-slate-900 ring-1 ring-slate-900 bg-slate-50' : 'border-slate-200 hover:border-slate-300'}`}>
                  <input type="radio" name="objective" id={`objective-${o.objective}`} className="sr-only" checked={objective === o.objective} onChange={() => chooseObjective(o.objective)} />
                  <div className="font-medium text-slate-800">{o.label}</div>
                  <div className="text-xs text-slate-500">{OBJECTIVE_HINT[o.objective]}</div>
                </label>
              ))}
            </div>
          </fieldset>

          {objective && (
            <>
              <div>
                <label htmlFor="campaign-title" className={label}>Title</label>
                <input id="campaign-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} className={field}
                  placeholder="e.g. Classic 38 — autumn push" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="campaign-brand" className={label}>Brand{objective === 'brand_awareness' ? '' : ' (to find products)'}</label>
                  <select id="campaign-brand" value={brand} onChange={(e) => setBrand(e.target.value)} className={field}>
                    <option value="">{objective === 'brand_awareness' ? 'Choose…' : 'Any brand'}</option>
                    {opts.brands.map((b) => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
                {needsProducts && (
                  <div>
                    <label htmlFor="campaign-search" className={label}>Search products</label>
                    <input id="campaign-search" value={search} onChange={(e) => setSearch(e.target.value)} className={field} placeholder="Name or code" />
                  </div>
                )}
              </div>

              {needsProducts && (
                <div>
                  <div className={label}>Products {picked.size > 0 && <span className="text-slate-800 font-medium">· {picked.size} chosen</span>}</div>
                  {shown.length === 0 && <p className="text-sm text-slate-400">{loadingProducts ? 'Looking…' : 'Choose a brand or search to see products.'}</p>}
                  {shown.length > 0 && (
                    <ul className="max-h-72 overflow-y-auto overscroll-contain divide-y divide-slate-100 rounded-lg border border-slate-200">
                      {shown.map((p) => {
                        const on = picked.has(p.product_id);
                        return (
                          <li key={p.product_id}>
                            <label className={`flex items-start gap-3 px-3 py-2 text-sm ${p.misfit && !on ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-slate-50'}`}>
                              <input type="checkbox" className="mt-1" checked={on} disabled={!!p.misfit && !on} onChange={() => toggle(p)} />
                              <span className="min-w-0 flex-1">
                                <span className="block font-medium text-slate-800">{p.name}</span>
                                <span className="block text-xs text-slate-500">
                                  {p.brand}{p.retail_price != null && ` · ${p.retail_price} KD`}
                                  {p.on_hand != null && ` · ${p.on_hand} in stock`}{p.units_90d != null && ` · ${p.units_90d} sold in 90 days`}
                                  {objective === 'new_arrivals' && p.arrived_on && (
                                    <> · arrived {p.arrived_on}{' '}
                                      <span className={p.arrival_basis === 'estimated_from_creation' ? 'text-amber-700' : ''}>({ARRIVAL_LABEL[p.arrival_basis ?? ''] ?? 'no record'})</span></>
                                  )}
                                </span>
                                {p.misfit && <span className="block text-xs text-rose-600">Does not fit: {p.misfit}</span>}
                              </span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="campaign-target" className={label}>Target</label>
                  <input id="campaign-target" type="number" min="1" inputMode="decimal" value={targetValue} onChange={(e) => setTargetValue(e.target.value)} className={field} />
                </div>
                <div>
                  <label htmlFor="campaign-unit" className={label}>Counted in</label>
                  <select id="campaign-unit" value={targetUnit} onChange={(e) => setTargetUnit(e.target.value)} className={field}>
                    {setting?.target_units.map((u) => <option key={u} value={u}>{UNIT_LABEL[u] ?? u}</option>)}
                  </select>
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label htmlFor="campaign-window" className={label}>Comparison window (days)</label>
                  <input id="campaign-window" type="number" min={setting?.min_window_days} value={windowDays} onChange={(e) => setWindowDays(e.target.value)} className={field} />
                  <p className="text-xs text-slate-500 mt-1">Standard {setting?.default_window_days} days, at least {setting?.min_window_days}.{setting?.exception_note ? ` ${setting.exception_note}` : ''}</p>
                </div>
              </div>

              <fieldset>
                <legend className={label}>Channels</legend>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(CHANNEL_LABEL).map(([k, v]) => {
                    const on = channels.includes(k);
                    return (
                      <label key={k} className={`px-3 py-1.5 rounded-full border text-sm cursor-pointer ${on ? 'bg-slate-900 text-white border-slate-900' : 'border-slate-300 text-slate-700 hover:border-slate-400'}`}>
                        <input type="checkbox" id={`channel-${k}`} className="sr-only" checked={on}
                          onChange={() => setChannels((cs) => (on ? cs.filter((c) => c !== k) : [...cs, k]))} />{v}
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="campaign-content" className={label}>Content</label>
                  <select id="campaign-content" value={contentKind} onChange={(e) => setContentKind(e.target.value)} className={field}>
                    <option value="">Team decides</option>
                    {Object.entries(CONTENT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="campaign-offer" className={label}>Offer</label>
                  <select id="campaign-offer" value={offer} onChange={(e) => setOffer(e.target.value)} className={field}>
                    {Object.entries(OFFER_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                {offer === 'discount' && (
                  <div>
                    <label htmlFor="campaign-offer-pct" className={label}>Discount %</label>
                    <input id="campaign-offer-pct" type="number" min="1" max="90" value={offerPct} onChange={(e) => setOfferPct(e.target.value)} className={field} />
                  </div>
                )}
                <div>
                  <label htmlFor="campaign-priority" className={label}>Priority</label>
                  <select id="campaign-priority" value={priority} onChange={(e) => setPriority(e.target.value)} className={field}>
                    {['Low', 'Normal', 'High', 'Urgent'].map((p) => <option key={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="campaign-deadline-new" className={label}>First draft due</label>
                  <input id="campaign-deadline-new" type="date" min={todayKuwait()} value={deadline} onChange={(e) => setDeadline(e.target.value)} className={field} />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="campaign-assignee" className={label}>Assign to</label>
                  <select id="campaign-assignee" value={assignee} onChange={(e) => setAssignee(e.target.value)} className={field}>
                    <option value="">Choose…</option>
                    {opts.team.map((t) => (
                      <option key={t.employee_id} value={t.employee_id}>
                        {t.name}{t.job_title ? ` (${t.job_title})` : ''} · {t.open_campaigns} open
                      </option>
                    ))}
                    <option value="team">The marketing team (whoever picks it up)</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="campaign-owner-new" className={label}>Campaign owner (approves it)</label>
                  <select id="campaign-owner-new" value={owner} onChange={(e) => setOwner(e.target.value)} className={field}>
                    {opts.owners.map((o) => <option key={o.user_id} value={o.user_id}>{o.name}{o.user_id === myId ? ' (me)' : ''}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="campaign-budget" className={label}>Budget cap, KD (optional)</label>
                <input id="campaign-budget" type="number" min="0" value={budget} onChange={(e) => setBudget(e.target.value)} className={field} />
                <p className="text-xs text-slate-500 mt-1">Recorded only. Nothing is spent or boosted from here; a paid boost is proposed on the Ads page by hand.</p>
              </div>

              <div>
                <label htmlFor="campaign-brief" className={label}>Brief for the team</label>
                <textarea id="campaign-brief" rows={4} maxLength={2000} value={brief} onChange={(e) => setBrief(e.target.value)} className={field}
                  placeholder="What to show, the tone, anything to avoid." />
              </div>

              {err && <p className="text-sm text-rose-600">{err}</p>}
              <div className="flex gap-2">
                <button disabled={busy} onClick={save} className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-700 disabled:opacity-50">
                  {busy ? 'Assigning…' : 'Assign campaign'}
                </button>
                <button disabled={busy} onClick={onClose} className="px-3 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-100">Cancel</button>
              </div>
            </>
          )}
          {!objective && err && <p className="text-sm text-rose-600">{err}</p>}
        </div>
      )}
      {!opts && err && <p className="text-sm text-rose-600">{err}</p>}
    </Modal>
  );
}
