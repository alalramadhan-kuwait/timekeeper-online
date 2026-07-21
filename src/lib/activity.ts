import { supabase } from './supabase';

/**
 * Records a page view for the User Activity page (admin oversight).
 * Throttled per path so navigating back and forth doesn't spam rows.
 */
const lastLogged = new Map<string, number>();
const THROTTLE_MS = 5 * 60 * 1000;

export function logActivity(userId: string | undefined, path: string) {
  if (!userId) return;
  const key = `${userId}|${path}`;
  const now = Date.now();
  if (now - (lastLogged.get(key) ?? 0) < THROTTLE_MS) return;
  lastLogged.set(key, now);
  // fire-and-forget; never block or break navigation
  void supabase.from('user_activity').insert({ user_id: userId, path }).then(undefined, () => {});
}
