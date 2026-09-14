/* ── what you had typed ───────────────────────────────────────────
   A record open in the editor is the one thing in Timekeeper that
   lives only on the device: everything else has already been written
   to the database. Close the app on a half-filled form — a call comes
   in, the phone locks, iOS reclaims the tab — and it was gone.

   So the form keeps a draft as you type, and offers it back when you
   reopen the same record. Offers, not applies silently: the record may
   have moved on in the meantime, and quietly resurrecting stale values
   over someone else's edit would be worse than losing the draft. The
   form says a draft was restored and lets you discard it.

   Drafts are per user, because a phone on a shop counter is not. */
const DRAFT_TTL = 2 * 60 * 60 * 1000;
const draftKey = (user: string | null | undefined, table: string, id: unknown) =>
  `tk:draft:${user ?? 'anon'}:${table}:${id ?? 'new'}`;

export function readDraft<T>(user: string | null | undefined, table: string, id: unknown): T | null {
  try {
    const raw = localStorage.getItem(draftKey(user, table, id));
    if (!raw) return null;
    const { at, form } = JSON.parse(raw) as { at: number; form: T };
    if (typeof at !== 'number' || Date.now() - at > DRAFT_TTL) {
      localStorage.removeItem(draftKey(user, table, id));
      return null;
    }
    return form ?? null;
  } catch { return null; }
}

export function writeDraft(user: string | null | undefined, table: string, id: unknown, form: unknown) {
  try { localStorage.setItem(draftKey(user, table, id), JSON.stringify({ at: Date.now(), form })); }
  catch { /* full, or private mode — a lost draft is not worth an error */ }
}

export function clearDraft(user: string | null | undefined, table: string, id: unknown) {
  try { localStorage.removeItem(draftKey(user, table, id)); } catch { /* ignore */ }
}

/** Signing out takes this user's drafts with it — the next person at the
    counter must not be handed someone else's half-written record. */
export function clearAllDrafts(user: string | null | undefined) {
  try {
    const prefix = `tk:draft:${user ?? 'anon'}:`;
    for (const k of Object.keys(localStorage)) if (k.startsWith(prefix)) localStorage.removeItem(k);
  } catch { /* ignore */ }
}
