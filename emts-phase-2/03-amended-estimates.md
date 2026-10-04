# Amended Estimates in Sales Reports

## Version map

This spec is the Minimal version, except for the nightly check. Screens are drawn in tab 6.

| Part of this spec | Version | Item IDs | Screen |
| --- | --- | --- | --- |
| How entries are worked out (including zero-change and negative entries) | Minimal | RP-M1, RP-M2 | S-RP2 |
| Estimate Log rows per entry | Minimal | RP-M3 | S-RP1 |
| Jobs Sold, Sales Goals, Monthly Goal, Revenue | Minimal | RP-M4 | S-RP2 |
| Dashboard counts unchanged | Minimal | RP-M5 | — |
| Backfill of past amendments | Minimal | RP-M6 | — |
| Nightly check that entries add up | Complete | RP-C4 | S-RP1 |
| Change detail, sales by estimator, change orders | Complete | RP-C1, RP-C2, RP-C3 | S-RP1, S-RP3, S-RP4 |

## Spec

### Name of module

REPORTS | Sales Entries for Amended Estimates

Type: Web Application · Category: Reports · Menu: Reports › Estimate Log, Jobs Sold, Sales Goals; Dashboard

### Description

When a sold estimate is amended, only the change in value counts as a sale, in the month the customer approves the change. The value already sold stays in its original month. The estimate keeps one number, and the estimate count on the dashboard does not go up.

Today the whole estimate moves to the month of the latest approval. Tim's August estimate of about $6,463, amended by $1,495 in September, showed about $7,900 sold in September and nothing in August. Tim cannot trust his monthly totals because of this. This spec delivers CR-2 from 23 Sep, with the display agreed with Tanmoy on 30 Sep.

### Key term

A sales entry is one line of sold value with a date. An estimate's first approval creates its first entry. Each later re-approval can create one more entry for the difference. Reports add up entries, not estimates.

### How entries are worked out

- First approval: entry value = the estimate total. Entry hours = the estimate's labour hours.
- Each re-approval: entry value = the new approved total minus the previous approved total. Entry hours = new hours minus previous hours.
- If both differences are zero, no entry is created. The change is kept in estimate history only.
- Entry date = the date the estimate reached Accepted: the customer's signature date, or the manual approval date.
- A declined or abandoned amendment creates no entry.
- Totals exclude sales tax, as sales figures do today.

Worked examples:

| Case | What happened | Entries created |
| --- | --- | --- |
| Added work | Sold $100 on 1 Sep. Amended to $150, approved 2 Oct | 1 Sep: $100 · 2 Oct: +$50 |
| Tim's case | Sold $6,463 in August. Amended to $7,958, approved 23 Sep | August: $6,463 · 23 Sep: +$1,495 |
| Removed work | Sold $2,000 on 5 Sep. Amended to $1,700, approved 12 Oct | 5 Sep: $2,000 · 12 Oct: −$300 |
| Paint colour renamed only | Sold $3,040 on 10 Aug. Colour name corrected, re-approved 20 Sep | 10 Aug: $3,040 only |
| Two amendments | Sold $500 on 3 Sep. +$100 approved 9 Sep. +$40 approved 4 Oct | 3 Sep: $500 · 9 Sep: +$100 · 4 Oct: +$40 |

### Design sequence

1. User amends an Accepted estimate (existing Amend Estimate flow).
2. User sends it for re-approval, or approves it manually.
3. When the estimate reaches Accepted again, the system compares it with the previous approved version and creates an entry if anything changed.
4. User opens Reports › Estimate Log.
5. The amended estimate shows one row per entry, all with the same estimate number.
6. User opens Jobs Sold or Sales Goals for a month and sees only the entries dated in that month.

### System behaviour

- Estimate Log: one row per entry. The first row is labelled Original. Later rows are labelled Amendment 1, Amendment 2, and so on. Each row shows its own date, value and hours.
- Estimate Log rows with the same estimate number sit together. Clicking any of them opens the same estimate.
- Jobs Sold, Sales Goals, the Monthly Goal widget and the Revenue widget add up entries by entry date.
- Negative entries reduce the total for their month and show in red with a minus sign.
- The dashboard estimate count, Estimate Status widget and win rate count estimates, not entries. An amendment never changes them.
- The estimate itself still shows one total: the latest approved total.
- Existing estimates amended before release are split using their saved history (`preAmendmentTotal` and `grandTotal` on each history entry), so past months become correct too.

### Output

- Estimate Log with one row per entry.
- Jobs Sold report and Sales Goals by month, built from entries.
- CSV and PDF exports of these reports, one line per entry.

### System validations

- Every estimate that has ever been Accepted has exactly one Original entry.
- The sum of an estimate's entries always equals its latest approved total. COMPLETE (RP-C4): a nightly check flags any estimate where it does not.
- Entries are never edited or deleted by users. A mistake is corrected by another amendment.
- Values use two decimal places in USD. Hours use one decimal place.

### Access validations

- Users with Report View (`REPORT_VIEW`) see entries in reports.
- Users who cannot see job financials (`JOB_VIEW_FINANCIALS`) see Estimate Log rows without values, as today.

### Activity logs

- Original = Reports: Sales entry created for {EstimateNo}: {Value}, {Hours} h, dated {Date}.
- Amendment = Reports: Amendment {N} entry created for {EstimateNo}: {SignedValue}, {SignedHours} h, dated {Date}.
- No change = Reports: {EstimateNo} re-approved with no change in value or hours. No sales entry created.
- Check failed = Reports: {EstimateNo} entries total {EntriesTotal} but approved total is {ApprovedTotal}. Flagged for review.

### Tables to use

| Insert into | Update | Source | Dependent |
| --- | --- | --- | --- |
| estimate\_sales\_entries (new; confirm name) | — | estimates, estimate\_history | reports queries, dashboard\_widgets, sales goals |

### Wireframe design

- Header: Reports, with the report picker.
- Left panel: main sidebar (unchanged).
- Main panel, Estimate Log table columns: Estimate No., Entry (Original / Amendment N), Customer, Date, Value, Hours, Status.

### Acceptance criteria

- Given an estimate sold for $100 on 1 Sep, When it is amended to $150 and re-approved on 2 Oct, Then Jobs Sold shows $100 in September and $50 in October.
- Given the same estimate, When the Estimate Log is opened, Then it shows two rows, Original and Amendment 1, with the same estimate number.
- Given the same estimate, When the dashboard loads, Then the estimate count is the same as before the amendment.
- Given only a paint colour name is changed, When the estimate is re-approved, Then no new entry or Estimate Log row is created.
- Given an estimate amended down by $300, When re-approved on 12 Oct, Then October's total drops by $300 and September is unchanged.
- Given an amendment the customer declines, Then no entry is created.
- Given an estimate amended before release, When the backfill runs, Then its entries match its saved history and add up to its approved total.
- Given hours rise by 6 with the added work, When Jobs Sold is opened for the amendment month, Then that row shows +6 hours.

Related: EMTS-414 (which date sales use) should be fixed at the same time, using the acceptance date.
