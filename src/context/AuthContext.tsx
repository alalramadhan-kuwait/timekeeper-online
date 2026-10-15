import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { clearAllDrafts } from '../lib/drafts';
import { supabase } from '../lib/supabase';

export type Role = 'admin' | 'manager' | 'staff' | 'hr' | 'viewer' | 'sales' | 'operations' | 'marketing';

export interface Profile {
  id: string;
  full_name: string;
  role: Role;
  page_access: string[] | null; // per-user page allow-list; null = role defaults
  sales_name?: string | null;   // DSR roster name their sales are logged under; null = not a salesperson
}

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  role: Role | null;
  pageAccess: string[] | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  role: null,
  pageAccess: null,
  loading: true,
  signIn: async () => ({ error: 'Not initialized' }),
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  // whose profile is held, so an event repeating the same sign-in does not fetch it again
  const profileFor = useRef<string | null>(null);

  async function loadProfile(userId: string) {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, role, page_access, sales_name')
      .eq('id', userId)
      .single();
    // only once it has arrived, so a profile that failed to load is still asked for again
    if (data) { setProfile(data as Profile); profileFor.current = userId; }
  }

  useEffect(() => {
    /* Not ready until the role is known. Routes are gated by role, and a gate asked before the profile
       arrived answered "no" and sent every alert link (attendance, purchase orders, projects) to the home
       page when the app was opened from a notification. */
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) { try { await loadProfile(session.user.id); } catch { /* signed in without a profile */ } }
      setLoading(false);
    });
    /* The listener also reports the session the app opened with, and the same
       sign-in again whenever the tab comes back into view. Both used to fetch
       the profile a second time at startup and on every return to the app.
       The opening session is getSession's above; a repeat for the person
       already loaded is skipped. A different person, a sign-out, and the
       hourly token refresh (which still re-reads the role) go through. */
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        if (event === 'INITIAL_SESSION') return;
        if (event === 'SIGNED_IN' && profileFor.current === session.user.id) return;
        loadProfile(session.user.id);
      } else {
        profileFor.current = null;
        setProfile(null);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error ? error.message : null };
  }

  async function signOut() {
    // a phone on a shop counter is not one person's, so the drafts go too
    clearAllDrafts(user?.id);
    await supabase.auth.signOut();
  }

  return (
    <AuthContext.Provider value={{ user, profile, role: profile?.role ?? null, pageAccess: profile?.page_access ?? null, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
