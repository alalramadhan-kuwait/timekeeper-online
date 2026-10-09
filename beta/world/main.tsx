/* Time Keeper World, private beta for the three owners.
   A separate site from TK Online: it shares the sign-in (same browser, same
   Supabase project) and nothing else. The World is downloaded only after the
   server says this person is an owner, and its data functions refuse anyone
   else on the server as well. */
import { lazy, Suspense, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import '../../src/index.css';
import { AuthProvider, useAuth } from '../../src/context/AuthContext';
import LoginPage from '../../src/components/LoginPage';
import { supabase } from '../../src/lib/supabase';

const WorldPage = lazy(() => import('../../src/world/WorldPage'));
const TK_ONLINE = 'https://alalramadhan-kuwait.github.io/timekeeper-online/';

function Splash({ text = 'Opening the World…' }: { text?: string }) {
  return <div className="fixed inset-0 grid place-items-center bg-slate-900 text-slate-300 text-sm">{text}</div>;
}

function Gate() {
  const { user, loading, signOut } = useAuth();
  const [allowed, setAllowed] = useState<{ id: string; ok: boolean } | null>(null);
  useEffect(() => {
    if (!user) return;
    let live = true;
    supabase.rpc('stock_ai_allowed').then(
      ({ data }) => { if (live) setAllowed({ id: user.id, ok: data === true }); },
      () => { if (live) setAllowed({ id: user.id, ok: false }); });
    return () => { live = false; };
  }, [user]);

  if (loading) return <Splash />;
  if (!user) return <LoginPage />;
  if (!allowed || allowed.id !== user.id) return <Splash />;
  if (!allowed.ok) return (
    <div className="fixed inset-0 grid place-items-center bg-slate-900 p-6">
      <div className="max-w-sm rounded-2xl bg-white p-6 text-center space-y-3">
        <div className="font-semibold text-slate-800">Time Keeper World is a private beta for the owners.</div>
        <div className="flex justify-center gap-3 text-sm">
          <a href={TK_ONLINE} className="rounded-lg bg-slate-900 px-3 py-2 text-white">Open TK Online</a>
          <button onClick={signOut} className="rounded-lg px-3 py-2 text-slate-600 hover:bg-slate-100">Sign out</button>
        </div>
      </div>
    </div>
  );
  return (
    <Suspense fallback={<Splash />}>
      <WorldPage onClose={() => { window.location.href = TK_ONLINE; }} />
    </Suspense>
  );
}

createRoot(document.getElementById('root')!).render(
  <HashRouter><AuthProvider><Gate /></AuthProvider></HashRouter>,
);
