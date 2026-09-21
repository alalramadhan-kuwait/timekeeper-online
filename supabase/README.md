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
  made today. **Known limitation:** the shared account cannot identify which
  individual is holding the phone, so that same-day correction is granted to
  whoever has the shop's device. This is a temporary compromise until personal
  employee logins replace the shared account, and it is the reason the shared
  account gets no CRM or history access at all.
- **Phone is identity**: `customers_guard_identity` normalises on the way in,
  refuses a non-number, refuses a number another customer holds, refuses to
  change a number Lightspeed holds (correct it at the till), and writes every
  change to `customer_contact_changes`.
- **Managers**: `manager_scopes` → outlet codes via the registry; Eman's scope
  is HQ + WhatsApp + Online explicitly. Manager edit rights are scoped too.
- The apps read entries through `cases_visible` and write to `cases`.

## The customer and the follow-up (Stage C, 2026-09-21)

Stage C put screens on the Stage A/B foundation. Nothing here loosens "who
may see whom"; every function below runs under the caller's own rules or
checks them first.

- **Customer Visit** (`customer_by_phone`, `lightspeed_today`): while a number
  is typed, the form asks whether it is known. Your own customer comes back
  with a name and a line of history; somebody else's comes back as
  "recognised" and nothing more; the shared phone only ever hears
  "recognised". A new number becomes a `customers` row when the visit is
  saved. `lightspeed_today` is the till's count for an outlet, limited by the
  `ls_sales` policy, so a salesperson sees only sales credited to them.
- **Labels, not types**: the stored `case_type` values are unchanged
  (`No Interaction`, `Follow-up`, `Lost Sale`, `Sale`). What people read is
  Browsing, Interested, Lost Opportunity, Manual Sale — `src/shared/caseLabels.ts`.
- **The roster** (`roster_employees()`): the one thing every login may ask about
  the team — which employee id goes with which roster name. The shared phone
  needs it to say *who* moved shops or sent a message; nothing else about the
  person leaves `employees`.
- **Outlet changes** (`log_outlet_change`, `outlet_changes`): a mid-day move is
  recorded against the open shift. The shared phone must name the salesperson.
  A manager flipping between shops to read figures is not a move and is not
  logged. Clocking out never closes the day; Close Day is its own action.
- **Customers** (`customer_list`, `customer_profile`, `customer_known_by`): the
  list and the page, answered by the database. `SECURITY INVOKER`, so the
  `customers` and `ls_sales` policies decide what is in them. The shared phone
  sees no customers here, and the page says so. Purchases are matched to a
  customer by number (`lightspeed_customers.phone_e164`), never merged.
- **WhatsApp** (`log_whatsapp_handoff`, `whatsapp_handoffs`, `message_templates`):
  a template (admin-only edit, English and Arabic, `render_template` ↔
  `src/shared/messageRules.ts`) is filled in and shown to read; WhatsApp opens
  with it typed. Nothing is sent by the system, and a handoff never marks a
  follow-up as contacted. The database refuses a handoff without a
  relationship. On the shared phone it is attributed to the salesperson named
  (`via_shared_device = true`, `created_by` = the shared account).
- **Occasions** (`customer_occasions`, `customers.anniversary`,
  `upcoming_occasions`, `occasion_recipients`, `occasion_reminders_due`,
  `raise_occasion_reminders`): birthdays, anniversaries and anything else with
  a date. At 06:00 Kuwait, `occasion-reminders` raises one `occasion_due`
  notification per occasion, seven days before and on the day, to one person:
  the responsible salesperson, else whoever served the customer last, else the
  shop's manager. The link opens the customer with the matching template ready.
- **Still true**: Today's outlet isolation is app-enforced (see Stage B); the
  shared login keeps its same-day-only phone access and gets no CRM; Stage D
  (till ↔ visit matching) has not started.
