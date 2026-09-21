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

## Who may see whom (Stage B, 2026-09-21)

Customer visibility is decided in the database, not the screens. In one line:
you see the customers you have dealt with, the floor sees today's store
activity, managers see their outlets, admins see everything.

- **Relationship** (employee ↔ customer) is *derived* from records and cached in
  `customer_relationships`: a Customer Visit / Follow-up / Lost Opportunity /
  Manual Sale where you are the named salesperson (whichever login saved it);
  a Lightspeed sale line credited to you — line-item salesperson first, till
  user as fallback; a manager assignment (`customers.responsible_employee_id`).
  It is recomputed by triggers on every change and rebuilt nightly, so a
  corrected or deleted entry takes its access away with it.
- **Today** (`cases_visibility`): floor roles see entries from today and
  yesterday at every selling outlet, with colleagues' phone numbers blanked by
  the `cases_visible` view. **Outlet isolation inside that window is enforced
  by the app's selected outlet, not the database**, because the database cannot
  know which shop a shared phone is in. This is temporary until personal
  employee logins make the outlet knowable; do not describe it as
  database-level outlet isolation.
- **Same-day phone correction**: a personal login sees the number on its own
  entry from today; the shared Staff login never sees a number in a list and
  reaches one only through `case_contact_for_edit()` on an unlocked entry it
  made today.
- **Phone is identity**: `customers_guard_identity` normalises on the way in,
  refuses a non-number, refuses a number another customer holds, refuses to
  change a number Lightspeed holds (correct it at the till), and writes every
  change to `customer_contact_changes`.
- **Managers**: `manager_scopes` → outlet codes via the registry; Eman's scope
  is HQ + WhatsApp + Online explicitly. Manager edit rights are scoped too.
- The apps read entries through `cases_visible` and write to `cases`.
