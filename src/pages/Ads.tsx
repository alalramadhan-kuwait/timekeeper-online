import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { MetaCampaignsPage } from './MetaCampaigns';
import { CampaignProposalsPage } from './CampaignProposals';

/**
 * Ads — the money Time Keeper spends on Meta, in one place (27 Sep): what is
 * running (Campaigns, Meta's own figures) and what is proposed next
 * (Proposals, owner-approved and built paused). Replaces the separate Meta
 * Campaigns and Campaign Proposals pages; their old addresses forward here.
 *
 * The tab lives in the address (?tab=proposals) so notifications and links
 * from Marketing Overview open the right one.
 */
export function AdsPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'proposals' ? 'proposals' : 'campaigns';
  const [waiting, setWaiting] = useState(0);

  useEffect(() => {
    void supabase.from('ad_proposals').select('id', { count: 'exact', head: true })
      .in('status', ['proposed', 'failed'])
      .then(({ count }) => setWaiting(count ?? 0));
  }, [tab]);

  const go = (t: 'campaigns' | 'proposals') => setParams(t === 'proposals' ? { tab: 'proposals' } : {}, { replace: true });

  return (
    <div className="max-w-[1400px] min-w-0">
      <h1 className="text-xl font-bold text-slate-900 mb-3">Ads</h1>
      <div className="flex gap-1 mb-4 border-b border-slate-200">
        {([['campaigns', 'Campaigns'], ['proposals', 'Proposals']] as const).map(([k, label]) => (
          <button key={k} onClick={() => go(k)}
            className={`px-4 py-2 text-sm -mb-px border-b-2 flex items-center gap-1.5 ${tab === k ? 'border-slate-900 text-slate-900 font-semibold' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
            {label}
            {k === 'proposals' && waiting > 0 && (
              <span className="min-w-5 h-5 px-1.5 rounded-full bg-amber-400 text-slate-900 text-[11px] font-bold flex items-center justify-center">{waiting}</span>
            )}
          </button>
        ))}
      </div>
      {tab === 'proposals' ? <CampaignProposalsPage embedded /> : <MetaCampaignsPage embedded />}
    </div>
  );
}
