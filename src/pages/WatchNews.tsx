import { useEffect, useMemo, useState } from 'react';
import { Newspaper, RefreshCw, ExternalLink, Star, EyeOff, Image as ImageIcon, Download, Save, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Spinner, Modal, Badge } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { renderCarousel, Palette } from '../lib/tkSlide';

// The feed is filled by the watch-news-sync edge function each morning. It reads
// the watch press — not the brand newsrooms — so everything here is a published
// article we can link to, and every photo carries its source.

interface SourceRow { id: string; name: string; enabled: boolean; last_synced_at: string | null; last_status: string | null }
interface NewsRow {
  id: string; source_name: string | null; title: string; link: string | null; summary: string | null;
  published_at: string | null; title_ar: string | null; slide_top_ar: string | null; slide_bottom_ar: string | null;
  image_url: string | null; image_credit: string | null; brands: string[]; score: number; status: string;
  content_task_id: string | null;
}

const STATUS_COLOR: Record<string, string> = {
  New: 'bg-slate-100 text-slate-600',
  Shortlisted: 'bg-amber-100 text-amber-700',
  Used: 'bg-emerald-100 text-emerald-700',
  Hidden: 'bg-rose-100 text-rose-600',
};

const ago = (iso: string | null) => {
  if (!iso) return '—';
  const h = (Date.now() - Date.parse(iso)) / 3600_000;
  if (h < 1) return 'just now';
  if (h < 24) return `${Math.round(h)}h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d}d ago`;
};

export default function WatchNewsPage() {
  const { role } = useAuth();
  const canEdit = ['admin', 'manager', 'marketing'].includes(role ?? '');

  const [items, setItems] = useState<NewsRow[]>([]);
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('New');
  const [source, setSource] = useState<string>('');
  const [brand, setBrand] = useState<string>('');
  const [composing, setComposing] = useState<NewsRow | null>(null);

  async function load() {
    const [n, s] = await Promise.all([
      supabase.from('news_items')
        .select('id, source_name, title, link, summary, published_at, title_ar, slide_top_ar, slide_bottom_ar, image_url, image_credit, brands, score, status, content_task_id')
        .order('score', { ascending: false }).order('published_at', { ascending: false }).limit(300),
      supabase.from('news_sources').select('id, name, enabled, last_synced_at, last_status').order('name'),
    ]);
    setItems((n.data as NewsRow[]) ?? []);
    setSources((s.data as SourceRow[]) ?? []);
    setLoading(false);
  }
  // The first read of a remote table on mount is exactly the external-system
  // sync effects are for; every setState in load() happens after an await.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, []);

  async function syncNow() {
    setSyncing(true); setMsg(null);
    const { data, error } = await supabase.functions.invoke('watch-news-sync', { body: {} });
    if (error || (data as { error?: string })?.error) {
      // invoke() masks the real reason — dig it out of the response body
      let detail = (data as { error?: string })?.error ?? error?.message;
      try { detail = (await (error as { context?: Response })?.context?.clone().json())?.error ?? detail; } catch { /* keep */ }
      setMsg(`Sync failed: ${detail}`);
    } else {
      const d = data as { new_items?: number; arabic_written?: number };
      setMsg(`Synced ✓ ${d?.new_items ?? 0} new stories · ${d?.arabic_written ?? 0} with Arabic`);
    }
    setSyncing(false);
    load();
  }

  async function setItemStatus(row: NewsRow, next: string) {
    setItems((prev) => prev.map((i) => (i.id === row.id ? { ...i, status: next } : i)));
    await supabase.from('news_items').update({ status: next }).eq('id', row.id);
  }

  const brands = useMemo(
    () => [...new Set(items.flatMap((i) => i.brands ?? []))].sort(),
    [items],
  );
  const shown = useMemo(() => items.filter((i) =>
    (status === 'All' || i.status === status)
    && (!source || i.source_name === source)
    && (!brand || (i.brands ?? []).includes(brand))), [items, status, source, brand]);

  const failing = sources.filter((s) => s.enabled && (s.last_status ?? '').startsWith('failed'));
  const lastSync = sources.map((s) => s.last_synced_at).filter(Boolean).sort().pop() ?? null;

  if (loading) return <Spinner />;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2"><Newspaper size={20} /> Watch News</h1>
          <p className="text-sm text-slate-500">
            The watch press, ranked for us. Auto-synced every morning.{lastSync && <> Last run {ago(lastSync)}.</>}
          </p>
        </div>
        {canEdit && (
          <button onClick={syncNow} disabled={syncing}
            className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-700 disabled:opacity-60">
            <RefreshCw size={15} className={syncing ? 'animate-spin' : ''} /> {syncing ? 'Syncing…' : 'Sync now'}
          </button>
        )}
      </div>

      {msg && (
        <div className={`mb-3 px-4 py-2 rounded-lg text-sm border ${msg.includes('✓') ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'}`}>{msg}</div>
      )}

      {failing.length > 0 && (
        <div className="mb-3 px-4 py-2 rounded-lg text-sm border bg-amber-50 border-amber-200 text-amber-800 flex items-start gap-2">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          <span>
            {failing.length === 1 ? 'A feed is not answering' : `${failing.length} feeds are not answering`}:{' '}
            {failing.map((f) => `${f.name} (${(f.last_status ?? '').replace('failed · ', '')})`).join(', ')}.
            Fix the URL in <span className="font-medium">news_sources</span> — the rest of the sync is unaffected.
          </span>
        </div>
      )}

      <p className="text-xs text-slate-400 mb-4">
        Ranking is source weight + how fresh it is + the brands we carry + launch and auction wording. Photos are the
        publisher’s and are stored with their credit — check the source’s terms before a photo goes out on our feed.
      </p>

      {/* filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="flex rounded-lg border border-slate-300 overflow-hidden text-xs">
          {(['New', 'Shortlisted', 'Used', 'All'] as const).map((s) => (
            <button key={s} onClick={() => setStatus(s)}
              className={`px-3 py-1.5 ${status === s ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
              {s}{s !== 'All' && <span className="ml-1 opacity-60">{items.filter((i) => i.status === s).length}</span>}
            </button>
          ))}
        </div>
        <select value={source} onChange={(e) => setSource(e.target.value)}
          className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-sm">
          <option value="">All sources</option>
          {sources.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
        </select>
        <select value={brand} onChange={(e) => setBrand(e.target.value)}
          className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-sm">
          <option value="">All brands</option>
          {brands.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
      </div>

      {shown.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-6 text-slate-400 text-sm">
          Nothing here yet{canEdit ? ' — press Sync now.' : '.'}
        </div>
      ) : (
        <div className="space-y-3">
          {shown.map((row) => (
            <article key={row.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-3 flex gap-3">
              <div className="w-28 h-28 sm:w-36 sm:h-36 shrink-0 rounded-lg bg-slate-100 overflow-hidden flex items-center justify-center">
                {row.image_url
                  ? <img src={row.image_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                  : <ImageIcon size={20} className="text-slate-300" />}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-400 mb-1">
                  <span className="font-medium text-slate-500">{row.source_name}</span>
                  <span>· {ago(row.published_at)}</span>
                  <Badge className={STATUS_COLOR[row.status] ?? STATUS_COLOR.New}>{row.status}</Badge>
                  <span className="ml-auto font-semibold text-slate-500">{row.score.toFixed(1)}</span>
                </div>

                <h2 className="text-sm font-semibold text-slate-800 leading-snug">{row.title}</h2>
                {row.title_ar && <p dir="rtl" className="text-sm text-slate-600 mt-0.5">{row.title_ar}</p>}
                {row.summary && <p className="text-xs text-slate-500 line-clamp-2 mt-1">{row.summary}</p>}

                <div className="flex flex-wrap items-center gap-2 mt-2">
                  {(row.brands ?? []).map((b) => (
                    <Badge key={b} className="bg-slate-100 text-slate-600">{b}</Badge>
                  ))}
                  {row.link && (
                    <a href={row.link} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                      <ExternalLink size={12} /> Read
                    </a>
                  )}
                  {canEdit && (
                    <div className="ml-auto flex flex-wrap gap-1.5">
                      <button onClick={() => setItemStatus(row, row.status === 'Shortlisted' ? 'New' : 'Shortlisted')}
                        className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs border ${row.status === 'Shortlisted' ? 'bg-amber-50 border-amber-300 text-amber-700' : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'}`}>
                        <Star size={12} /> Shortlist
                      </button>
                      <button onClick={() => setItemStatus(row, row.status === 'Hidden' ? 'New' : 'Hidden')}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs border bg-white border-slate-300 text-slate-600 hover:bg-slate-50">
                        <EyeOff size={12} /> {row.status === 'Hidden' ? 'Unhide' : 'Hide'}
                      </button>
                      <button onClick={() => setComposing(row)} disabled={!row.image_url}
                        title={row.image_url ? undefined : 'No photo was found for this story, so there is nothing to build a slide from'}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-40">
                        <ImageIcon size={12} /> Make slides
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {composing && (
        <SlideComposer row={composing} onClose={() => setComposing(null)} onSaved={() => { setComposing(null); load(); }} />
      )}
    </div>
  );
}

/* ---------------- slide composer ---------------- */

function SlideComposer({ row, onClose, onSaved }: { row: NewsRow; onClose: () => void; onSaved: () => void }) {
  const [top, setTop] = useState(row.slide_top_ar ?? row.title_ar ?? '');
  const [bottom, setBottom] = useState(row.slide_bottom_ar ?? '');
  const [palette, setPalette] = useState<Palette>('auto');
  const [slides, setSlides] = useState(1);
  const [previews, setPreviews] = useState<{ url: string; blob: Blob }[]>([]);
  const [missing, setMissing] = useState<{ overlay: boolean; font: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Blob URLs are the browser's to hold until we let them go.
  useEffect(() => () => previews.forEach((p) => URL.revokeObjectURL(p.url)), [previews]);

  async function build() {
    if (!row.image_url) return;
    setBusy(true); setErr(null);
    try {
      const out = await renderCarousel({ imageUrl: row.image_url, top, bottom, palette }, slides);
      previews.forEach((p) => URL.revokeObjectURL(p.url));
      setPreviews(out.map((r) => ({ blob: r.blob, url: URL.createObjectURL(r.blob) })));
      setMissing(out[0].missing);
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(false);
  }

  function download() {
    previews.forEach((p, i) => {
      const a = document.createElement('a');
      a.href = p.url;
      a.download = `tk-${row.id.slice(0, 8)}-${i + 1}.png`;
      a.click();
    });
  }

  /** Put the cover into the Content Planner, where the rest of the posting flow lives. */
  async function saveToPlanner() {
    if (previews.length === 0) return;
    setBusy(true); setErr(null);
    try {
      const path = `news-${row.id}-${Date.now()}.png`;
      const { data: up, error: upErr } = await supabase.storage.from('project-photos')
        .upload(path, previews[0].blob, { contentType: 'image/png', upsert: true });
      if (upErr) throw upErr;
      const assetUrl = supabase.storage.from('project-photos').getPublicUrl(up.path).data.publicUrl;

      const caption = [top, bottom].filter(Boolean).join('\n')
        + `\n\nSource: ${row.source_name ?? 'watch press'}${row.link ? ` — ${row.link}` : ''}`;

      const { data: task, error: taskErr } = await supabase.from('content_tasks').insert({
        title: row.title.slice(0, 200),
        content_type: 'Post',
        channel: 'Instagram',
        status: 'Idea',
        caption,
        asset_url: assetUrl,
        approval_status: 'Pending',
      }).select('id').single();
      if (taskErr) throw taskErr;

      await supabase.from('news_items').update({
        status: 'Used', content_task_id: task.id,
        slide_top_ar: top || null, slide_bottom_ar: bottom || null,
      }).eq('id', row.id);

      setSaved(true);
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <Modal title="Build the slides" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-xs text-slate-500">{row.title}</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-medium text-slate-600">Line 1 (Arabic)</span>
            <input dir="rtl" value={top} onChange={(e) => setTop(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 text-sm" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">Line 2 (Arabic, optional)</span>
            <input dir="rtl" value={bottom} onChange={(e) => setBottom(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 text-sm" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">Palette</span>
            <select value={palette} onChange={(e) => setPalette(e.target.value as Palette)}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white">
              <option value="auto">Auto (from the photo)</option>
              <option value="dark">Dark template</option>
              <option value="light">Light template</option>
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">Slides</span>
            <select value={slides} onChange={(e) => setSlides(Number(e.target.value))}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white">
              {[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        </div>

        {!top.trim() && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            No Arabic line yet. The sync writes one when the ANTHROPIC_API_KEY secret is set; otherwise type it here.
          </p>
        )}

        <button onClick={build} disabled={busy}
          className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-700 disabled:opacity-60">
          <RefreshCw size={15} className={busy ? 'animate-spin' : ''} /> {previews.length ? 'Re-render' : 'Render'}
        </button>

        {err && <p className="text-sm text-rose-600">{err}</p>}

        {missing && (missing.overlay || missing.font) && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Rendered without {[missing.overlay && 'the TK template overlay', missing.font && 'the Bahij headline font'].filter(Boolean).join(' and ')}.
            Upload {missing.overlay && <code>White_temp.png</code>}{missing.overlay && missing.font && ', '}
            {missing.overlay && <code>Black_temp.png</code>}{missing.overlay && missing.font && ' and '}
            {missing.font && <code>Bahij-Helvetica-Neue-Bold.ttf</code>} to the <span className="font-medium">brand-assets</span> bucket
            and render again to match the posted template exactly.
          </p>
        )}

        {previews.length > 0 && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {previews.map((p, i) => (
                <img key={i} src={p.url} alt={`Slide ${i + 1}`} className="w-full rounded-lg border border-slate-200" />
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={download}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 text-sm hover:bg-slate-50">
                <Download size={15} /> Download {previews.length > 1 ? `${previews.length} PNGs` : 'PNG'}
              </button>
              <button onClick={saveToPlanner} disabled={busy || saved}
                className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-500 disabled:opacity-60">
                <Save size={15} /> {saved ? 'Saved to planner ✓' : 'Save to Content Planner'}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
