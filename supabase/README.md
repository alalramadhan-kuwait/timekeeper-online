# Supabase — source of truth for the database & edge functions

The Timekeeper backend (schema, RLS, triggers, SQL functions, cron, edge functions) lives in
Supabase project **`ttshgrujnycapugrmyxs`** (shared with `watch-store-crm`). This folder makes it
reproducible and reviewable from git.

## One-time: link the project
```bash
brew install supabase/tap/supabase        # or: npm i -g supabase
supabase link --project-ref ttshgrujnycapugrmyxs
# needs the database password (Dashboard → Project Settings → Database)
```

## Pull the database into git  ← do this once to complete Phase 0, Step 1
All **85 migrations** already exist in the remote migration history (verified). Materialise them
into `supabase/migrations/` and capture the full baseline:
```bash
supabase db pull          # writes the remote migration history + a baseline schema here
git add supabase/migrations && git commit -m "chore(db): baseline schema from remote"
```
> This is the byte-perfect way to version-control the DB; it needs the DB password, which is why it
> isn't checked in by a bot. Everything applied to date is recoverable — nothing is lost.

## Add a change going forward (never edit the DB by hand)
```bash
supabase migration new <name>     # creates supabase/migrations/<timestamp>_<name>.sql
# write the SQL, then:
supabase db push                  # applies to the linked project
```

## Edge functions
Committed here (active):
- **notify-flush** — cron dispatcher for notifications (every 30s). Secret read from `app_config`.
- **notify-test** — "Send test" from Notification Settings (JWT-auth).

Other active functions still to be pulled with `supabase functions download <slug>`:
`admin-users`, `lightspeed-sync`, `lightspeed-po-sync`, `lightspeed-oauth-callback`,
`instagram-connect`, `instagram-sync`, `instagram-apify-sync`, `influencer-followers-sync`,
`daily-briefing`.

**Deprecated — safe to delete in the Dashboard** (superseded when notifications moved to DB
triggers + the flush cron; no longer called by anything):
- `push-notify`, `notify-dispatch`

Deploy a function:
```bash
supabase functions deploy notify-flush
```

## Secrets
- The notification dispatch secret lives in the **`app_config`** table (`id = 'notify_key'`,
  service-role only) — not in source. Rotate it by updating that row; the flush cron reads it live.
- Never hardcode secrets in migrations or function source. VAPID keys live in `push_config`;
  the Apify token in `apify_config`; Lightspeed tokens in `lightspeed_auth`.
