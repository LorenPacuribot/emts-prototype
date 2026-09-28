# Build Guide (conventions for this replica)

This app is a front-end-only replica of the live Estimate Master (EMTS) app.
There is no backend. All data lives in a local store that saves to localStorage.

## Where things are

| Path | What it is |
| --- | --- |
| `app/<module>/page.tsx` | One folder per route (App Router). Pages are client components (`'use client'`). |
| `components/Navigation.tsx` | `AppHeader` (top bar) and `PageShell` (header + scrolling content). |
| `components/Sidebar.tsx` | Main left sidebar and mobile drawer. |
| `components/settings/SettingsSidebar.tsx` | Settings left nav and `SettingsPage` wrapper. |
| `components/ui/*` | Shared UI kit: `Button`, form controls, `Modal`, `RowMenu`, `Badge`, `Card`, `Pagination`, etc. |
| `components/Modals/Modal.tsx` | `Modal` and `ConfirmDialog` (Radix Dialog). |
| `components/<module>/*` | Components used by one module only (e.g. `components/estimates/LineItemsEditor.tsx`). |
| `lib/types.ts` | All TypeScript types (re-exports `lib/types/core.ts` and `lib/types/settings.ts`). |
| `lib/sampleData.ts` | Builds the initial database from `lib/data/*.ts`. |
| `lib/store.tsx` | Data hooks: `useCollection`, `useSingleton`, `useNextNumber`, `useLookups`, `useLogActivity`. |
| `lib/calculations.ts` | All money math (estimate and invoice totals). |
| `lib/constants.ts` | Nav items, statuses and badge colors. |
| `lib/utils.ts` | `cn`, `uid`, `money`, `shortDate`, `longDate`, `daysAgo`, `fullName`, ... |

## Page pattern

```tsx
'use client';
import { PageShell } from '@/components/Navigation';
import { PageHeader } from '@/components/ui/display';
import { Button } from '@/components/ui/button';
import { useCollection } from '@/lib/store';

export default function EstimatesPage() {
  const { items, add, update, remove } = useCollection('estimates');
  return (
    <PageShell title="Estimates">
      <PageHeader title="Estimates" subtitle="Manage your proposals..." actions={<Button>Create</Button>} />
      ...
    </PageShell>
  );
}
```

- Dynamic routes: read ids with `useParams()` from `next/navigation`.
- Anything using `useSearchParams()` must be inside `<Suspense>` or `next build` fails.
- Settings pages render inside `app/settings/layout.tsx` (header + settings nav already there). Wrap content in `<SettingsPage title subtitle actions>`.

## Data rules

- Read and write only through `lib/store.tsx` hooks. Never import `lib/data/*` directly in pages.
- New document numbers come from `useNextNumber()('ESTIMATE' | 'LEAD' | 'JOB' | 'WORK_ORDER' | 'INVOICE')`.
- Totals come from `estimateTotals()` / `invoiceTotals()` in `lib/calculations.ts`.
- Log important actions with `useLogActivity()` so the dashboard Activity card updates.
- You may add optional fields to types. Do not rename or remove fields.

## Style rules

- Tailwind utilities only. No inline `style` except for data-driven colors or widths (progress bars, stage colors).
- Colors: `primary-*` is the blue brand color. Page background is `bg-gray-50`, cards are white with `border-gray-200` and `rounded-2xl`.
- Headings use `font-heading` (Manrope). Body text uses Roboto.
- Small uppercase labels: `text-[11px] font-bold uppercase tracking-[0.15em] text-gray-500`.
- Every list needs an empty state (`EmptyState`) and search/filter where the live app has one.
- Buttons: `variant="primary" | "secondary" | "danger" | "ghost" | "dark" | "outline"`.
- Toast feedback after saves: `const { toast } = useToast(); toast('Lead saved')`.

## Checking your work

- Type-check: `npx tsc --noEmit`
- Dev server: `npm run dev` then open http://localhost:3000
- Production build: `npm run build`
