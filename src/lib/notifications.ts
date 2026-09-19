/**
 * The back office's notification feed.
 *
 * The reading itself moved to src/shared/notifications when the shop floor app
 * needed the same feed — it had none at all, so the store manager was told
 * nothing about requests waiting on him. This file is the thin adapter between
 * this app's auth types and that shared reader, so there is one implementation
 * rather than two that drift.
 */
import type { User } from '@supabase/supabase-js';
import type { Profile, Role } from '../context/AuthContext';
import {
  loadMyNotifications as loadShared, unreadCount, markRead, type FeedNotif,
} from '../shared/notifications';

export type { FeedNotif };

/** Notifications addressed to this account (person-targeted or their role), newest first. */
export const loadMyNotifications = (
  user: User, _profile: Profile | null, role: Role | null, limit = 100,
): Promise<FeedNotif[]> => loadShared(user.id, role, { limit });

export const unreadNotificationCount = (
  user: User, _profile: Profile | null, role: Role | null,
): Promise<number> => unreadCount(user.id, role);

export const markNotificationsRead = (userId: string, ids: string[]): Promise<void> =>
  markRead(userId, ids);
