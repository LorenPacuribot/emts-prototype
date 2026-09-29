# Estimate Master (EMTS) Replica

A front-end replica of the live Estimate Master app (app.estimate-master.com).
It reproduces the live screens and workflows using local mock data, so it can be the starting point for new features.

Application records are saved to localStorage and, when Supabase is configured, shared through the `app_state` table so everyone works on one copy. Sign-in is checked on the server (see **Sign-in** below). Supplier integration routes have a separate access gate.

## New features (merged from emts-prototype)

The 14 features from the EMTS feature prototype (User Stories and Final Design v1.0) are built into this replica. Every new part has a green **NEW** badge. Features 33 and 34 also carry **Needs client confirmation**.

- **Inside the existing screens:**
  - Estimates: colour card, change orders, from history, preliminary list, amend rule.
  - Work orders: live status flow, materials and paint orders, crew clock and time log, closeout, "Use in marketing".
  - Jobs: cost and hours card.
  - Job Scheduling: crew actual hours.
  - Contacts: Paint History tab with QR links and reorders.
  - Leads: repaint follow-up, website lead review.
  - Reports: five new tabs.
  - Dashboard: new widgets and the demo walkthrough.
  - Invoices: QuickBooks state.
  - Settings: waste settings, deposit percent, rate versions and the paint catalogue.
- **New sidebar modules:** Time, Supplier Orders, Repaint Alerts, Accounting, Marketing.
- **New settings pages:** Social Accounts, Accounting, Suppliers, Repaint Intervals.
- **Demo tools:** the **Prototype** bar (bottom-left) switches the demo user to show the access rules, pins the clock, starts the product tour and resets all demo data.

How it fits together:

- `features/` is the prototype's engine, ported as is: its data model, store, actions, rules (346 tests, run `npm test`) and feature panels. Its docs are in the original prototype's `docs/` folder (DEV_HANDOFF.md, INTEGRATION_MAP.md).
- `lib/bridge/` keeps the two stores in step. A customer, lead, estimate, job, work order or invoice has the **same id** in both.
  - The prototype's demo story is projected into the replica collections.
  - Records made on replica screens are mirrored into the prototype.
  - Status changes go through the prototype's actions, so its rules apply. A refused change is rolled back with a toast.
- Core document numbers come from one shared sequence, and a new record's number is also its id.

## Run it

You need Node.js 20 or newer.

```bash
npm install
npm run dev        # http://localhost:3000
```

Other commands:

- `npm run build` builds for production (all 62 routes build cleanly).
- `npm start` serves the production build.
- `npm run typecheck` runs TypeScript with no output.

To go back to the original sample data, open **Help & Support** and click **Reset demo data**, or use the Prototype bar. Both reset the replica and the feature data together.

## Tech stack

- Next.js 16 (App Router) and React 19
- TypeScript (strict mode)
- Tailwind CSS v4
- Radix UI primitives (Dialog, Select, Dropdown Menu, Switch, Checkbox, Tabs, Popover, Tooltip)
- lucide-react icons

## Modules and routes

| Module | Routes |
| --- | --- |
| Dashboard | `/dashboard` |
| Lead Pipeline | `/leads` (board and table), `/leads/[id]` |
| Contacts | `/contacts`, `/contacts/[id]` |
| Calendar | `/calendar` |
| Estimates | `/estimates`, `/estimates/new`, `/estimates/[id]` (builder), `/estimates/[id]/preview`, `/estimates/[id]/client-view`, `/estimates/[id]/history` |
| Jobs | `/jobs`, `/jobs/[id]` |
| Job Scheduling | `/job-scheduling` (job and crew boards, day, week and month) |
| Work Orders | `/work-orders`, `/work-orders/[id]`, `/work-orders/[id]/print` |
| Invoices | `/invoices`, `/invoices/new?jobId=`, `/invoices/[id]`, `/invoices/[id]/preview`, `/invoices/[id]/pay` |
| Presentation Builder | `/presentations`, `/presentations/[id]` (builder), `/presentations/[id]/view` |
| Reports | `/reports` |
| Help & Support | `/support` |
| Settings | `/settings/<section>`, 28 sections in three groups: Organization, Configuration and Libraries |

## How a record moves through the app

1. A lead is added on the Lead Pipeline and moved through the stages.
2. An estimate is built from a template (areas, surfaces, paint, tiers, extras, discount, tax).
3. The estimate is sent, and the customer approves it on the client view with a typed signature.
4. The approved estimate is converted to a job.
5. The job is scheduled, crew is assigned, and work orders are created.
6. An invoice is created from the job and payments are recorded.

Each step writes to the same local store, so the dashboard, reports and activity feed update right away.

## Project layout

```
app/                     One folder per route
components/
  Navigation.tsx         Top bar (AppHeader) and PageShell
  Sidebar.tsx            Main sidebar and mobile drawer
  ui/                    Shared UI kit (Button, form controls, menus, badges, pagination...)
  Modals/Modal.tsx       Modal and ConfirmDialog
  <module>/              Components used by one module
lib/
  types.ts               All TypeScript types (re-exports lib/types/*)
  sampleData.ts          Builds the starting database from lib/data/*
  data/                  Mock records (core records, then settings)
  store.tsx              Data hooks: useCollection, useSingleton, useNextNumber...
  calculations.ts        All money math (estimate and invoice totals)
  constants.ts           Navigation, statuses and badge colors
  utils.ts               Formatting helpers
docs/BUILD_GUIDE.md      Coding conventions for this project
```

## Working with data

Pages never import mock data directly. They use hooks from `lib/store.tsx`:

```tsx
const { items, add, update, remove } = useCollection('estimates');
const [config, setConfig] = useSingleton('generalConfig');
const nextNumber = useNextNumber();   // nextNumber('ESTIMATE') -> "EST-2026-16"
```

To connect a real backend later, replace the inside of these hooks with API calls. The pages can stay the same.

## Known differences from the live app

- The logo and presentation cover photos are placeholders (SVG and gradients), because the live image files were not in the source export.
- These are not built: file attachments, CSV contact import, rich-text email editing, and estimate packages (Good/Better/Best) inside the estimate builder. Package templates can still be managed in Settings.
- Payment gateway, email and SMS sending are simulated. Configured supplier integrations can send real requests from the server.

## Sign-in

Passwords are checked on the server (`app/api/auth/*`, `lib/auth/server.ts`). A successful sign-in sets an HttpOnly, signed `emts_session` cookie for 12 hours, and `proxy.ts` redirects any staff page to `/login` without it. Customer links, the website form and API routes stay public. Passwords are stored only as scrypt hashes on the server: in Supabase `app_state` under a key `/api/state` never serves, or in server memory in local development without Supabase. Five failed attempts lock a username for 15 minutes on that server instance.

Set these private environment variables (never with `NEXT_PUBLIC_`):

| Variable | Needed | What it does |
| --- | --- | --- |
| `AUTH_SECRET` | Production | 32+ random characters that sign the session cookie. Without it nobody can sign in on a production build. |
| `AUTH_OWNER_PASSWORD` | Optional | Lets the owner sign in before any password has been set, to set everyone else's in Settings › Team Access. |
| `AUTH_DEMO_PASSWORDS` | Optional | `on` accepts the old demo passwords for people who have no password yet. On by default in development, off in production. Turn it off before real customer data is entered. |

The owner or office manager sets passwords in Settings › Team Access. Anyone can change their own after entering their current one. Signing in makes you the current user; only the owner can switch to another person with Prototype › Viewing as.

**Two people editing at once.** Each save names the version it started from. If someone else saved first, `/api/state` refuses it and the browser merges the two copies record by record (`lib/json-merge.ts`). Where both changed the same field, the other person's value is kept and a notice names the item. Other people's saves are picked up when the tab regains focus.

**Not covered yet.** `/api/state` is still readable and writable without a session, because customer pages (estimate approval, paint record) run on the shared copy. Moving those pages onto their own narrow endpoints is the next step before real customer data.

## Supplier access

Copy `.env.example` to `.env.local` for local development and set a unique `SUPPLIER_ADMIN_PASSWORD` of at least 24 characters. Keep all supplier credentials server-side. In production use the hosting provider's private environment settings and HTTPS. The supplier routes return 503 until the password is configured, and 401 until authenticated.

Open Settings > Suppliers > **Sign in for live supplier access**, then use username `supplier-admin` and the configured password. This shared administrator gate protects supplier connection, order and inbox routes; it is not application-wide authentication. Supplier webhooks retain their separate signature verification.

See [the code gap review](docs/CODE_GAP_REVIEW.md) for the implemented fixes, verification and remaining production work.
