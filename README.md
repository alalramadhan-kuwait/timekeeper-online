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

## Adding users
Create the user in Supabase Auth (Dashboard → Authentication → Add user), then
set their role in `public.profiles`. The `handle_new_user` trigger creates the
profile automatically; pass `full_name` and `role` in user metadata or update
the row afterwards.
