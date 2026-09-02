import { supabase } from './supabase';
import type { User } from '@supabase/supabase-js';
import type { Profile, Role } from '../context/AuthContext';

// The signed-in person's notification feed (in-app notification centre).
export interface FeedNotif {
  id: string;
  created_at: string;
  event_type: string;
  title: string;
  body: string;
  url: string | null;
  read: boolean;
}

/** Notifications addressed to this account (person-targeted or their role), newest first. */
export async function loadMyNotifications(user: User, _profile: Profile | null, role: Role | null, limit = 100): Promise<FeedNotif[]> {
  const orFilter = role
    ? `person_user_id.eq.${user.id},audience_roles.cs.{${role}}`
    : `person_user_id.eq.${user.id}`;
  const [{ data: rows }, { data: reads }] = await Promise.all([
    supabase.from('notifications')
      .select('id, created_at, event_type, title, body, url, exclude_user, person_user_id')
      .or(orFilter)
      .order('created_at', { ascending: false })
      .limit(limit),
    supabase.from('notification_reads').select('notification_id').eq('user_id', user.id),
  ]);
  const readSet = new Set((reads ?? []).map((r: { notification_id: string }) => r.notification_id));
  return (rows ?? [])
    .filter((n: any) => n.exclude_user !== user.id && n.event_type !== 'po_summary')
    .map((n: any) => ({ id: n.id, created_at: n.created_at, event_type: n.event_type, title: n.title, body: n.body, url: n.url, read: readSet.has(n.id) }));
}

export async function unreadNotificationCount(user: User, profile: Profile | null, role: Role | null): Promise<number> {
  const list = await loadMyNotifications(user, profile, role, 100);
  return list.filter((n) => !n.read).length;
}

export async function markNotificationsRead(userId: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await supabase.from('notification_reads').upsert(ids.map((id) => ({ user_id: userId, notification_id: id })), { onConflict: 'user_id,notification_id' });
}
