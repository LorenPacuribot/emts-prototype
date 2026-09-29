# Estimate Master (EMTS) Replica

A front-end replica of the live Estimate Master app (app.estimate-master.com).
It reproduces the live screens and workflows using local mock data, so it can be the starting point for new features.

Application records live in the browser and are saved to localStorage. There is no application login or shared production database. Supplier integration routes run on the server and have a separate access gate.

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

- There is no login, and Logout only shows a message.
- The logo and presentation cover photos are placeholders (SVG and gradients), because the live image files were not in the source export.
- These are not built: file attachments, CSV contact import, rich-text email editing, and estimate packages (Good/Better/Best) inside the estimate builder. Package templates can still be managed in Settings.
- Payment gateway, email and SMS sending are simulated. Configured supplier integrations can send real requests from the server.

## Supplier access

Copy `.env.example` to `.env.local` for local development and set a unique `SUPPLIER_ADMIN_PASSWORD` of at least 24 characters. Keep all supplier credentials server-side. In production use the hosting provider's private environment settings and HTTPS. The supplier routes return 503 until the password is configured, and 401 until authenticated.

Open Settings > Suppliers > **Sign in for live supplier access**, then use username `supplier-admin` and the configured password. This shared administrator gate protects supplier connection, order and inbox routes; it is not application-wide authentication. Supplier webhooks retain their separate signature verification.

See [the code gap review](docs/CODE_GAP_REVIEW.md) for the implemented fixes, verification and remaining production work.
