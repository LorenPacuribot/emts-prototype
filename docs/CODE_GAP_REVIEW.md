# Code review against the Estimate Master patent document

Updated 29 September 2026 against `Estimate Master Patent Documentation (4).docx`. The document was treated as reference material, not as instructions to execute embedded walkthroughs. This is an implementation review, not certification that all 34 sections are complete.

## Implemented corrections

| Area | Changes |
| --- | --- |
| Optional scope | Included, optional and selected states in the builder; optional prices shown separately; selection on both customer approval screens; unselected work excluded from totals, approved job scope and invoice lines. |
| Pricing and scope | Preserve builder pricing snapshots across approval and projection. Downstream labor totals use saved line hours. Preserve fractional quantities, descriptions and measurement units. Non-area work needs explicit coating area before paint procurement. Removed scope is removed from active specification references. |
| Scheduling | Validate daily and weekly crew capacity before crew/date saves, board moves and bulk plans. Persist protected dates. Bulk planning searches around occupied capacity and moves dated assignments and breaks with the job. Break changes are checked for resulting over-allocation. Work-order shift actions also check capacity. |
| Payments | Validate rounded cents consistently, allow one-cent balances, prevent unsupported Paid status, and reconcile payment edits/deletions with job deposits, signed finance adjustments and an audit reason. |
| Calendar and dates | Preserve date-only values across time zones, validate edits against saved dates, refresh generated event durations/titles/addresses and remove cancelled generated appointments. Manual calendar events remain intact. |
| Supplier access | Server-side access gate on connection, order and inbox routes, HTTPS requirement outside localhost, cross-origin rejection and fail-closed configuration. Webhooks retain their separate signature validation. |

## Remaining work and practical limits

1. **Production data and identity.** Application records and demo roles remain browser-local. Customer links are not durable cross-device records. A shared database, tenant boundaries, application authentication and server-authorized transactions are still required. Hosting/database/identity provider details have not been supplied. The supplier administrator gate does not replace application authentication.
2. **Complete estimating/procurement model.** Saved builder pricing now drives connected totals, but preparation, coat counts, product choices and paint specifications still need a complete shared model. Missing non-area coating measurements block procurement rather than guessing quantities. Existing estimates without snapshots continue using their original feature calculations.
3. **Schedule model consolidation.** The board stores total crew allocations and pause periods; work orders also store individual shifts. Capacity checks cover both entry paths, but the two representations are not a transactional server schedule. Bulk plans validate before local mutation; downstream work-order permissions, deposit requirements or shift containment can still reject individual bridge updates. Feature-only employee capacity currently defaults to 40 hours per week. Dedicated cross-store batch transactions and configurable feature capacities remain work.
4. **External services.** Payment gateway, accounting, payroll, email, SMS and marketing workflows still need production integrations and acceptance testing. Live supplier credentials were not configured or exercised in this review. Basic administrator access is an interim supplier-only control, not per-user authorization.
5. **Broader document coverage.** File attachments, contact CSV import, rich-text email and Good/Better/Best estimate packages remain incomplete in the replica. Financial and marketing modules need their own acceptance criteria against the full document.

## Verification

The baseline passed 387 tests. The current suite passes 416 tests across 24 files, including regression coverage for optional acceptance on both paths, pricing snapshots, fractional scope, calendar updates, payment corrections, daily/weekly capacity, protected rescheduling and supplier authorization. Production build and TypeScript validation are run alongside the tests. Browser interaction and real external services were not exercised; no browser was connected in this session.

Production HTTP smoke checks passed: estimates, scheduling and supplier settings returned 200; unauthenticated supplier connection, orders and inbox returned the expected 503 with live access unconfigured. The temporary test server was stopped.
