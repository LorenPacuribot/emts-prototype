# Estimate Master Books (New Module)

## Screen-level spec

This tab covers the Minimal version of Books (BK-M1 to BK-M13). Complete items are listed in the Scope tab and drawn in tab 6. Screens: S-BK1 to S-BK9.

### Name of module

FINANCE | Estimate Master Books

Type: Web Application · Category: Transactions · Menu: Books (main sidebar)

### Description

Books is built-in accounting, so a painting contractor can run their business without QuickBooks. Invoices, payments, deposits and refunds from Estimate Master are recorded in the books automatically. The owner enters supplier bills and expenses, matches bank statements, and runs the standard reports their accountant needs.

Books replaces QuickBooks completely. An organisation on Books has no QuickBooks connection. Payroll stays in Gusto, and tax filing stays with the accountant.

### Key terms

- Double entry: every amount is recorded twice, as a debit on one account and a credit on another. Debits and credits in every entry are equal, so the books always balance.
- Posting: the entry Books makes when something happens, such as an invoice being sent.
- Reversal: an equal and opposite entry that cancels a mistake. Entries are never deleted.

### Accountant review

The design was reviewed on 1 Oct the way a small-business accountant would review it. Seven gaps were found and fixed below. Books now keeps its records on an accrual basis (income when invoiced, costs when billed) and can also show every report on a cash basis (income when paid, costs when paid).

| Gap found | Why it matters | Fix |
| --- | --- | --- |
| Deposits became income when a job was marked complete, which is not tied to invoicing | Income could land in the wrong month | Deposits move to income when the final invoice is sent |
| Card payments reach the bank in daily batches, minus fees | Bank lines would never match single payments, so reconciliation fails | "Payments to deposit" holding account and fee posting (BK-M10) |
| The credit card was treated as a bank account | A card balance is money owed, not money held | Chase Card is a liability account (2300) |
| No equity accounts | Opening balances, owner withdrawals and year-end profit had nowhere to go | Owner's equity, Opening balance equity, Owner draws, Retained earnings; year-end roll (BK-M13) |
| No bad debt or overpayment handling | Money owed by customers would stay overstated | Write-offs and customer credits (BK-M11) |
| Sales tax was collected but never paid out | Sales tax to pay would only grow | Sales tax payment (BK-M12) |
| Many small contractors file on a cash basis | Owner and accountant need both views | Cash or accrual toggle on reports (BK-M13) |

Two simplifications are deliberate:

- No stock tracking. Paint and materials go straight to job cost when bought, which suits contractors who buy per job. Leftover paint is not tracked.
- Wages in Minimal. Gusto's bank withdrawals are sorted into Wages and Payroll taxes during reconciliation. BK-C2 later replaces this with a proper journal from each pay run.

### Preset chart of accounts

| No. | Name | Type | System account |
| --- | --- | --- | --- |
| 1000 | Chase Checking | Bank | Yes |
| 1050 | Payments to deposit | Current asset | Yes |
| 1200 | Money owed by customers | Current asset | Yes |
| 2000 | Money owed to suppliers | Current liability | Yes |
| 2100 | Customer deposits | Current liability | Yes |
| 2200 | Sales tax to pay | Current liability | Yes |
| 2300 | Chase Card | Credit card | No |
| 3000 | Owner's equity | Equity | No |
| 3050 | Opening balance equity | Equity | Yes |
| 3100 | Owner draws | Equity | No |
| 3900 | Retained earnings | Equity | Yes |
| 4000 | Painting income | Income | Yes |
| 4100 | Other income | Income | No |
| 5000 | Paint and materials | Cost of jobs | No |
| 5100 | Subcontractors | Cost of jobs | No |
| 5200 | Equipment rental | Cost of jobs | No |
| 6000 | Vehicle and fuel | Expense | No |
| 6100 | Insurance | Expense | No |
| 6200 | Card processing fees | Expense | Yes |
| 6300 | Wages | Expense | No |
| 6310 | Payroll taxes | Expense | No |
| 6400 | Advertising | Expense | No |
| 6500 | Office and software | Expense | No |
| 6900 | Bad debts | Expense | Yes |

### Posting rules

Revised after the accountant review. A licensed CPA signs these off before real customer books go live.

| When this happens | Debit | Credit |
| --- | --- | --- |
| Deposit invoice sent | 1200 Money owed by customers | 2100 Customer deposits |
| Progress invoice sent | 1200 Money owed by customers | 4000 Painting income, and 2200 Sales tax to pay for any tax |
| Final invoice sent | 1200 Money owed by customers | 4000 Painting income, and 2200 for any tax |
| Final invoice sent: deposits on that job | 2100 Customer deposits | 4000 Painting income |
| Card payment received | 1050 Payments to deposit | 1200 Money owed by customers |
| Cheque, cash or transfer received | 1000 Bank account chosen | 1200 Money owed by customers |
| Card batch reaches the bank | 1000 Bank for the net amount, and 6200 Card processing fees for the fee | 1050 Payments to deposit for the gross amount |
| Overpayment received | 1000 or 1050 | 1200, leaving a credit on the customer for their next invoice |
| Refund before the final invoice | 2100 Customer deposits | 1000 Bank account chosen |
| Refund after the final invoice | 4000 Painting income | 1000 Bank account chosen |
| Unpaid invoice written off | 6900 Bad debts | 1200 Money owed by customers |
| Supplier bill entered | 5000 to 5200 for job costs (tagged to the job), or an expense account | 2000 Money owed to suppliers |
| Supplier bill paid | 2000 Money owed to suppliers | 1000 Bank account chosen |
| Purchase on the credit card | The cost or expense account | 2300 Chase Card |
| Credit card bill paid | 2300 Chase Card | 1000 Bank account chosen |
| Sales tax paid to the state | 2200 Sales tax to pay | 1000 Bank account chosen |
| Owner takes money out | 3100 Owner draws | 1000 Bank account chosen |
| Opening balances at the start date | Each asset account | 3050 Opening balance equity (liabilities the other way round) |
| Year end (automatic) | — | The year's profit rolls into 3900 Retained earnings; income and expense accounts start the new year at zero |

Worked check with the sample job: deposit INV-2026-112 of $2,000.00 and final INV-2026-118 of $5,958.00. After the final invoice, Painting income for JOB-2026-37 is $5,958.00 + $2,000.00 = $7,958.00, which equals the approved estimate total, and Customer deposits for that job is back to $0.00.

### Design sequence

1. Owner opens Settings › Integrations and picks Estimate Master Books as the accounting destination.
2. The system asks: "Switch to Estimate Master Books? QuickBooks will be disconnected." Owner confirms.
3. The system creates the preset chart of accounts and asks for a start date and each bank account's opening balance on that date.
4. The Books item appears in the main sidebar.
5. From then on, invoices, payments, deposits and refunds post automatically.
6. Each month, the owner imports bank statements, reconciles, enters bills, reviews reports, and closes the month.

### System behaviour

- Postings happen automatically from accounting events (X-M3). Users never type an entry for an invoice or payment.
- Users can post manual journal entries only for adjustments, and only with the Accountant or Owner role.
- Every entry links to its source record. Clicking the source opens the invoice, payment or bill.
- A closed month cannot receive new postings. An event dated in a closed month posts on the first day of the next open month, with a note naming the original date.
- Reports are built from postings only, so they always match the journal.

### Output

- Journal of all postings.
- Profit and Loss, Balance Sheet, Money owed to you, Money you owe, Sales tax summary, each exportable as PDF and CSV.
- General ledger and trial balance export for the accountant.

### System validations

- Every entry's debits equal its credits. An entry that does not balance cannot be saved.
- Account numbers are unique and four digits.
- Accounts marked "System account" in the preset cannot be deleted or renumbered.
- An account with postings cannot be deleted, only made inactive.
- Amounts use two decimal places in USD.
- A month can close only when every bank account is reconciled to $0.00 difference for that month.

### Access validations

- Owner: everything, including switching to Books, closing months and reopening them.
- Admin: bills, banking, reports. Cannot close or reopen months.
- Other roles: no access to Books.

### Activity logs

- Switch = Books: Accounting destination changed from {Old} to Estimate Master Books by {User} at {Timestamp}.
- Posting = Books: {EntryNo} posted from {SourceType} {SourceNo}: {Amount}.
- Manual = Books: Manual entry {EntryNo} posted by {User}: {Description}.
- Reversal = Books: {EntryNo} reversed by {NewEntryNo} by {User}. Reason: {Reason}.
- Close = Books: {Month} closed by {User} at {Timestamp}.
- Reopen = Books: {Month} reopened by {User}. Reason: {Reason}.
- Reconcile = Books: {Account} reconciled for {Month} by {User}. Statement balance {Balance}.

### Tables to use

| Insert into | Update | Source | Dependent |
| --- | --- | --- | --- |
| ledger\_accounts, journal\_entries, journal\_lines, bills, bill\_lines, bank\_accounts, bank\_statement\_lines, reconciliations, accounting\_periods (all new; confirm names) | ledger\_accounts, bills, bank\_statement\_lines, accounting\_periods | accounting events (X-M3), invoices, payments, jobs, customers | organisations (accounting destination), roles\_permissions |

### Acceptance criteria

- Given Books is chosen, When an invoice is sent, Then a balanced journal entry appears linked to that invoice.
- Given a payment is received, Then money owed by customers drops by the payment amount and the bank account rises by the same amount (for card payments, Payments to deposit rises instead, until the batch reaches the bank).
- Given a user tries to save a manual entry where debits and credits differ, Then saving is blocked.
- Given August is closed, When a payment dated 30 Aug is recorded, Then it posts on 1 Sep with a note "Original date 30 Aug".
- Given any journal entry, Then there is no Delete control, only Reverse.
- Given the Balance Sheet for any date, Then total assets equal total liabilities plus equity.
- Given Books is chosen, When Settings › Integrations is opened, Then the QuickBooks card is hidden.

## Component specs

Layouts and sample data for each screen are in tab 6. This section lists what each part must do.

| Screen | Item | Must do | Empty state |
| --- | --- | --- | --- |
| S-BK1 Overview | BK-M1 | Tiles and panels reflect the chosen period; each tile links to its report | "No activity yet. Send an invoice to see it here." |
| S-BK2 Chart of accounts | BK-M2 | Add, edit, deactivate accounts; system accounts locked | — (preset accounts always exist) |
| S-BK3 Journal | BK-M3, BK-M9 | Filter by date, account, source; Reverse with a required reason | "No entries in this period." |
| S-BK4 Bills | BK-M4 | Enter a bill with lines split across accounts and jobs; record payment; attach receipt up to 10 MB | "No bills yet." |
| S-BK5 Banking | BK-M5 | Import CSV, map columns once per bank, match lines, create an entry from an unmatched line, finish only at $0.00 difference | "Import a statement to start reconciling." |
| S-BK6 Reports | BK-M6 | Date range, compare to previous period, export PDF and CSV | "No postings in this range." |
| S-BK7 Close and export | BK-M7, BK-M8 | Close checklist; Owner can reopen with a reason; export general ledger and trial balance | — |
| S-BK5 Banking | BK-M10 | Match an Authorize.Net batch deposit to the card payments it contains; post the fee difference to 6200 | "No card payments waiting to be deposited." |
| Invoice detail and S-BK3 Journal | BK-M11 | Owner-only "Write off" action on an unpaid invoice with a required reason; customer credit shown on the contact and applied to the next invoice | — |
| S-BK6 Reports | BK-M12 | "Record payment to state" button on the sales tax summary, pre-filled with the amount owed for the period | "No sales tax owed for this period." |
| S-BK6 Reports and S-BK7 Close | BK-M13 | Cash / Accrual toggle on every report (default Accrual); year-end roll runs when the last month of the year is closed | — |

Acceptance criteria for components:

- Given a bill of $1,120.00 split $900.00 to Paint and materials and $220.00 to Subcontractors, When saved, Then each account shows its amount and the total owed to suppliers rises by $1,120.00.
- Given 10 bank lines imported and 9 matched, When the owner clicks Finish, Then Finish is disabled and the difference is shown.
- Given September is closed, When the owner reopens it, Then a reason is required and the reopen is logged.
