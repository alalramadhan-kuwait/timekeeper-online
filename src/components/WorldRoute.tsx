import { lazy, Suspense, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Spinner } from './ui';

/* Time Keeper World is downloaded only after the server says this person is one
   of the three owners. Anyone else is sent home without the World's code ever
   reaching their device; its data functions refuse them on the server as well. */
const WorldPage = lazy(() => import('../world/WorldPage'));

export default function WorldRoute() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  useEffect(() => {
    supabase.rpc('stock_ai_allowed').then(({ data }) => setAllowed(!!data), () => setAllowed(false));
  }, []);
  if (allowed === null) return <Spinner />;
  if (!allowed) return <Navigate to="/" replace />;
  return (
    <Suspense fallback={<Spinner />}>
      <WorldPage />
    </Suspense>
  );
}
