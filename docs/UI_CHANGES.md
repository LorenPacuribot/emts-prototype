# UI and UX Changes

The pass follows `docs/UI_UX_IMPROVEMENT_PROMPT.md`. Each phase adds its rows below.

Baseline before any edit: `npx vitest run` gave 48 files and 567 tests, all passing.

## Changes

### Phase 1: Foundations (C2, C3, S1–S3)

| Screen / area | What changed | Rule | Files |
| --- | --- | --- | --- |
| Feature button kit (every feature screen) | Now matches the live kit: `primary` is `bg-primary-600` with the soft blue shadow and border; `secondary` is white, gray border and `shadow-sm`; `md` uses `text-sm`; all sizes `rounded-lg`; `icon` is 36px like the live kit; `justify-center`; focus ring `ring-primary-400/60`. New sizes `xs`, `lg`, `icon-sm` and new variant `outline` (same as the live kit). New `loading` prop: shows a spinner, sets `aria-busy` and disables the button. New `danger-solid` variant (filled red, the live kit's `danger`). `danger` is still the red outline and the default variant is still `secondary`, so existing calls keep their meaning. | C2, S3, F3 | `features/components/ui/button.tsx` |
| Confirm dialogs | The destructive confirm button uses `danger-solid` instead of `dark` with a red class override. It looks the same. | C2 | `features/components/ui/dialog.tsx` |
| Feature UI kit (badge, card, misc, form, table, dialog, menu, live) | `slate-*` changed to `gray-*` and `emerald-*` to `green-*`. Hand-set sizes moved onto the type scale: badges, chips, table body, helper text and hints use `text-xs`; inputs, menu items, empty-state titles and toasts use `text-sm`; uppercase micro labels (`CardLabel`, `MicroLabel`, `TH`, `MicroPill`, `LiveLabel`, `NewBadge`, `ConfirmBadge`) use `text-xxs`; modal and drawer titles use `text-lg`. `EmptyState` is `rounded-2xl` like the live kit. | C2, C3, S1, S2, S3 | `features/components/ui/*.tsx` |
| Every feature screen, plus `app/**` and `components/**` (API routes excluded) | Scripted swap of `slate-50…950` to the same `gray-*` shade (1,119 classes) and `emerald-*` to the same `green-*` shade (173 classes). All prefixes and modifiers are kept (`bg-`, `text-`, `border-`, `ring-`, `from-`, `to-`, `divide-`, `hover:`, `/opacity`). | S1 | 242 files. See "Files" below. |
| Every screen | Scripted swap of 1,446 hand-set `text-[Npx]` sizes onto the C3 scale. From 7px to 10.5px: `text-xxs` when the same class string or `className={…}` expression has `uppercase` (275), otherwise `text-xs` (1,068 in total with the 11px–12.5px ones). 13px–14px became `text-sm` (65), 15px–16px `text-base` (25), 17px–18px `text-lg` (5), 20px `text-xl` (5), 22px `text-2xl` (1). Nothing people have to read is below 12px now. Only uppercase micro labels are 10px. | C3, S2 | Same sweep |
| Module page titles (`PageHeader`) | Title changed from `text-[26px] md:text-[28px]` to `font-heading text-3xl md:text-4xl` with `text-wrap: balance`, so it matches `LivePageTitle`. | C3, S2, S4, V3 | `features/components/layout/screen.tsx` |
| Class merging (all screens) | `text-xxs` (already defined in `app/globals.css`) was unknown to `tailwind-merge`, which treated it as a text colour. `cn("text-xxs text-gray-400")` quietly dropped `text-gray-400`. Both `cn` helpers now register `xxs` as a font size. | C3 (fix needed for the scale to work) | `features/lib/cn.ts`, `lib/utils.ts` |

Files: the sweep changed files under `features/components/features/**` (marketing, future-estimate, service, workforce, finance, procurement, properties, color-card, materials, estimates, change-orders, work-orders, leads, settings, public-record, contacts, reports, jobs, closeout, dashboard and others), `features/components/layout/*`, `features/components/tour/product-tour.tsx`, `features/components/ui/*`, `components/**` (settings, estimates, dashboard, leads, scheduling, jobs, presentations, invoices, contacts, ui, reports, Sidebar and others) and `app/**` pages. `git diff --stat` lists every file.

What Phase 1 kept on purpose:

- `NewBadge` stays `bg-emerald-500`. The `className` overrides passed to `<NewBadge …/>` (`text-emerald-700` on a white badge inside primary buttons) also stay emerald. The collapsed-nav "new" dots in `components/Sidebar.tsx` and `features/components/layout/icon-rail.tsx` stay `bg-emerald-500`, because they stand in for the NewBadge at nav level (hard rule 6). All other "new section" outlines (`isNew` ring and border) are now `green-*`, so they match each other.
- `IdChip` stays `rounded-md` (a square record-number chip, like the live `NumberChip`). `PillTabs` stays `rounded-xl` until Phase 4 (H4) restyles tabs and filter chips. Its text is now `text-xs`.

## Moved, not removed

No Phase 1 entries. No action was moved.

## Data questions

No Phase 1 entries. No numbers or labels for numbers were changed.

## Not done

Phase 1:

- `features/lib/rules/lead-pipeline.ts` (`emerald-*` for the "Sold" stage) and `features/lib/rules/marketing-social.ts` (`emerald-*` on the Google Business chip, `slate-*` on the TikTok chip) still use those palettes. Both files are off limits (business rules). A developer should move these colour strings into a UI mapping, or approve editing them.
- `features/components/features/properties/qr-print.tsx` keeps its `text-[6.5pt]` to `text-[12pt]` sizes. They set the physical size of the printed QR sticker, so they are print measurements, not screen type.
- `components/settings/SettingsSidebar.tsx` keeps `lg:text-[0.95rem]` (about 15px, above the minimum). It is the live Settings sidebar, which N3 in Phase 2 uses as the model, so it was left for that phase.
- Tabs and filter chip styles (H4 and S5) are left for Phase 4.
