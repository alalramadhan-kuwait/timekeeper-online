import { useMemo, useState } from 'react';
import { Check, Search, X, Loader2 } from 'lucide-react';
import {
  brandOf, saveCampaignTag, whenTagged,
  type Brand, type StoredTag,
} from '../lib/metaBrands';

/**
 * Which brand a campaign was for — the answer a person gives.
 *
 * Reading the brand out of a Meta campaign name works for about a quarter of
 * the spend and cannot do much better, so this is where the real answer comes
 * from. What is chosen here always wins; the name-reader only fills the gap
 * until somebody has been here.
 *
 * Four answers, and the fourth matters as much as the others. A campaign can be
 * for one or more brands, it can be for the shop rather than any brand, or it
 * can be genuinely unreadable — and "unreadable" has to be selectable, because
 * the alternative is somebody picking a brand they are not sure of to make the
 * screen stop asking. A guess stored as fact is worse than no answer: it is a
 * number somebody will act on.
 */
export function CampaignBrandPicker({ campaignId, campaignName, tag, brands, canEdit, onSaved, userId }: {
  campaignId: string;
  campaignName: string | null;
  tag: StoredTag | null;
  brands: Brand[];
  canEdit: boolean;
  userId: string | null;
  onSaved: (t: StoredTag | null) => void;
}) {
  type Mode = 'brand' | 'whole_shop' | 'unknown' | 'unset';
  const [mode, setMode] = useState<Mode>(tag?.kind ?? 'unset');
  const [picked, setPicked] = useState<string[]>(tag?.brandIds ?? []);
  const [find, setFind] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const guess = brandOf(campaignName);
  const suggestion = guess.kind === 'brand' ? brands.find((b) => b.name === guess.brand) : undefined;

  const shown = useMemo(() => {
    const q = find.trim().toLowerCase();
    return q ? brands.filter((b) => b.name.toLowerCase().includes(q)) : brands;
  }, [brands, find]);

  const byId = useMemo(() => new Map(brands.map((b) => [b.id, b.name])), [brands]);

  const dirty = mode !== (tag?.kind ?? 'unset')
    || (mode === 'brand' && !sameSet(picked, tag?.brandIds ?? []));

  async function save() {
    setBusy(true); setErr(null);
    try {
      const next = mode === 'unset' ? null
        : { kind: mode as StoredTag['kind'], brandIds: mode === 'brand' ? picked : [] };
      await saveCampaignTag(campaignId, next, userId);
      onSaved(next === null ? null : {
        kind: next.kind,
        brandIds: next.brandIds,
        brandNames: next.brandIds.map((id) => byId.get(id) ?? '').filter(Boolean).sort(),
        setAt: new Date().toISOString(),
        setBy: userId,
      });
    } catch (e: any) {
      setErr(e?.message ?? 'Could not save that.');
    } finally {
      setBusy(false);
    }
  }

  if (!canEdit) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <p className="text-[11px] uppercase tracking-wider font-semibold text-slate-400">Brand</p>
        <p className="text-sm text-slate-700 mt-0.5">{describe(tag, guess.brand)}</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <p className="text-[11px] uppercase tracking-wider font-semibold text-slate-400">Brand</p>
        <p className="text-[11px] text-slate-400">
          {tag
            ? `Set by hand${tag.setAt ? ` · ${whenTagged(tag.setAt)}` : ''}`
            : 'Not set — read from the campaign name'}
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5 mt-2">
        {([
          ['brand', 'For a brand'],
          ['whole_shop', 'Whole shop — no single brand'],
          ['unknown', 'Unknown — cannot tell'],
          ['unset', 'Read it from the name'],
        ] as const).map(([v, label]) => (
          <button key={v} type="button" onClick={() => setMode(v)}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border ${
              mode === v ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}`}>
            {label}
          </button>
        ))}
      </div>

      {mode === 'brand' && (
        <div className="mt-3">
          {/* More than one is allowed on purpose: a campaign that really did
              carry two brands should say so rather than be filed under whichever
              one happened to be typed first. */}
          <p className="text-[11px] text-slate-400 mb-1.5">
            Pick one, or several if the campaign genuinely covered more than one.
          </p>

          {!!picked.length && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {picked.map((id) => (
                <span key={id} className="inline-flex items-center gap-1 bg-slate-900 text-white text-xs px-2 py-1 rounded-md">
                  {byId.get(id) ?? 'Brand'}
                  <button type="button" aria-label={`Remove ${byId.get(id) ?? 'brand'}`}
                    onClick={() => setPicked(picked.filter((x) => x !== id))}>
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}

          {suggestion && !picked.includes(suggestion.id) && (
            <button type="button" onClick={() => setPicked([...picked, suggestion.id])}
              className="mb-2 text-xs text-slate-600 underline underline-offset-2 hover:text-slate-900">
              The name looks like {suggestion.name} — use it
            </button>
          )}

          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Find a brand…"
              className="w-full pl-8 pr-2 py-1.5 rounded-lg border border-slate-300 text-sm" />
          </div>
          <div className="mt-1.5 max-h-48 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
            {shown.map((b) => {
              const on = picked.includes(b.id);
              return (
                <button key={b.id} type="button"
                  onClick={() => setPicked(on ? picked.filter((x) => x !== b.id) : [...picked, b.id])}
                  className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-sm ${on ? 'bg-slate-50 font-medium text-slate-900' : 'text-slate-600 hover:bg-slate-50'}`}>
                  <span className={`w-4 h-4 rounded border flex items-center justify-center ${on ? 'bg-slate-900 border-slate-900 text-white' : 'border-slate-300'}`}>
                    {on && <Check size={11} />}
                  </span>
                  {b.name}
                </button>
              );
            })}
            {!shown.length && <p className="px-2.5 py-3 text-xs text-slate-400">No brand matches “{find}”.</p>}
          </div>
        </div>
      )}

      {mode === 'whole_shop' && (
        <p className="mt-2 text-xs text-slate-500">
          Counted under <span className="font-medium">Whole shop</span> — retargeting, the catalogue,
          the app, straps, a seasonal sale. Money that was never meant to belong to one brand.
        </p>
      )}
      {mode === 'unknown' && (
        <p className="mt-2 text-xs text-slate-500">
          Counted under <span className="font-medium">Unknown</span>. Use this rather than picking a
          brand you are not sure of — a guess stored here becomes a figure somebody acts on.
        </p>
      )}
      {mode === 'unset' && (
        <p className="mt-2 text-xs text-slate-500">
          Falls back to reading the campaign name, which currently gives{' '}
          <span className="font-medium">{guess.brand}</span>.
        </p>
      )}

      {err && <p className="mt-2 text-xs text-rose-600">{err}</p>}

      <div className="flex items-center gap-2 mt-3">
        <button type="button" onClick={save}
          disabled={busy || !dirty || (mode === 'brand' && !picked.length)}
          className="flex items-center gap-1.5 bg-slate-900 text-white px-3 py-1.5 rounded-lg text-sm font-medium disabled:opacity-40">
          {busy && <Loader2 size={13} className="animate-spin" />}
          {busy ? 'Saving…' : 'Save brand'}
        </button>
        {mode === 'brand' && !picked.length && (
          <span className="text-xs text-slate-400">Pick at least one brand, or choose another answer.</span>
        )}
      </div>
    </div>
  );
}

const sameSet = (a: string[], b: string[]) =>
  a.length === b.length && [...a].sort().join() === [...b].sort().join();

function describe(tag: StoredTag | null, guess: string): string {
  if (!tag) return `${guess} — read from the campaign name`;
  if (tag.kind === 'whole_shop') return 'Whole shop — no single brand';
  if (tag.kind === 'unknown') return 'Unknown';
  return tag.brandNames.join(', ') || 'Brand';
}
