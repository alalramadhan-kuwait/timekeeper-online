# Timekeeper Online — Operations Control System

Centralized management system for Timekeeper: sales reporting, customer demand,
purchase orders, consignments, VIP customers, HR records, leave, and company
document expiry — all on one live dashboard.

## Stack
- React 18 + Vite + TypeScript + Tailwind
- Supabase (same project as `watch-store-crm` — shares auth, profiles, brands, and live sales data)
- Hash routing, so it deploys anywhere static (e.g. GitHub Pages)

## Run
```bash
npm install
npm run dev      # http://localhost:5180
npm run build    # production build in dist/
```

## On a phone

Timekeeper installs to the Home Screen and runs as its own app — **Share → Add
to Home Screen** on iOS, **⋮ → Install app** on Android. Installing is also what
makes Web Push work on iPhone; Safari will not deliver notifications to a tab.

Installed, it:

- opens in its own window with no browser chrome, its own icon and a launch
  screen, and keeps clear of the Dynamic Island and the home indicator;
- opens in well under a second, because the shell — the HTML and Vite's
  content-hashed JavaScript and CSS — is held on the device by the service
  worker. Measured to the first rendered screen:

  | | first visit | once installed |
  |---|---|---|
  | wifi | 0.5 s | 0.06 s |
  | 4G | 2.2 s | 0.06 s |
  | slow 3G | 21 s | 0.06 s |

  With no network it still opens; what it cannot do is *read*. Every figure on
  every page is live data from Supabase and is never served from a cache — a
  stale sales number is not a faster answer, it is a wrong one. Offline you get
  the app and an empty dashboard, not yesterday's totals.
- comes back to the page you were on, for up to eight hours. A link or a tapped
  notification always wins over that memory.
- keeps what you had typed. A record open in the editor is the only thing in
  Timekeeper that lives solely on the device, so the form saves a draft as you
  type and offers it back — visibly, with a Discard — when you reopen the same
  record within two hours. Drafts are per user and are cleared on sign-out,
  because a phone on a shop counter is not one person's.
- never zooms the interface by accident: no pinch, no double tap, and no jump
  when a field takes focus.

### Updating it

Push to `main`; CI builds and publishes. The service worker fetches the new
build in the background and the app says *A new version is ready* with an
Update button rather than reloading itself under someone mid-form. The build id
is a hash of the built file list, so an unchanged build never nags anyone and a
changed one always reaches them.

## Modules
| Module | Tables | Who can edit |
|---|---|---|
| Dashboard + Alerts | all | read-only view |
| Sales Reports | `cases`, `sale_items` (live CRM data) | entry stays in watch-store-crm |
| Waiting List | `waiting_list` | admin, manager, staff |
| Pre-Orders | `pre_orders` | admin, manager, staff |
| PO & Inbound | `purchase_orders` | admin, manager |
| Consignments | `consignments` | admin, manager |
| VIP Customers | `customers` | admin, manager, staff |
| HR — Employees | `employees` | admin, hr (manager can view) |
| Leave Tracking | `leave_records` | admin, hr (manager can view) |
| Company Documents | `company_documents` | admin, hr (everyone can view) |

Roles live in `public.profiles.role`: `admin`, `manager`, `staff`, `hr`, `viewer`.
Access is enforced both in the UI and by Postgres row-level security.

## Alerts
The dashboard computes reminders client-side on load, per spec tiers:
60 / 30 / 7 days before expiry, plus overdue. Sources: waiting-list follow-ups,
pre-order arrivals, PO delays and missing invoices, employee residency/work
permits, company document expiry, VIP birthdays/occasions (next 30 days), and
pending leave requests.

## Moved out
The Watch Design Studio used to live in `public/studio/`. It now has its own
repository and its own Pages site:
[watch-design-studio](https://github.com/alalramadhan-kuwait/watch-design-studio)
→ https://alalramadhan-kuwait.github.io/watch-design-studio/

All that remains here is a redirect at `/timekeeper-online/studio/`, so links
shared before the move still work. Nothing else in this repo depends on it.

## Adding users
Everything is done in the app by an admin or manager — Settings → **Team & Access**.
Create the account (username becomes `name@time-keeper.com`), pick a role, set a
temporary password. Roles decide the default pages; the sliders set a per-person
allow-list instead (Custom with nothing ticked = portal only).

### A salesperson with their own login
1. Settings → Team & Access → **Add employee account** — role **staff** (the DSR
   only lets `staff` and `admin` log sales).
2. Edit the row → **DSR name** = their name in the staff roster. Their sales are
   recorded under that exact name, so history stays continuous even when the
   login name is fuller (login "Fadi Hussain" logs as "Fadi").
3. Access sliders → Custom, tick nothing → portal only (Dashboard, My Portal,
   Inbox, Notifications).
4. HR → Employees → their record → **Linked user account** = the new login;
   Location = their outlet. My Portal, leave, attendance and the DSR's default
   outlet all hang off this link.
5. Settings → Attendance Locations: a geofence named exactly like the HR
   location (`Time Gallery`, `Avenues`) — clock-in needs one.

The shared `staff` login keeps working unchanged for anyone not yet migrated.
