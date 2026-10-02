# QuickBooks Integration

## Version map

This spec is mostly the Minimal version. The parts marked COMPLETE below only apply if Tim chooses Complete. Screens are drawn in tab 6.

| Part of this spec | Version | Item IDs | Screen |
| --- | --- | --- | --- |
| Screen-level spec (connect, sync, lock, log) | Minimal | QB-M1 to QB-M7 | S-QB1 to S-QB5 |
| "Customer created in QuickBooks → review list" row | Complete | QB-C1 | S-QB2 |
| Variance and deletion flags | Complete | QB-C3 | S-QB2 |
| Component 1 — Connection card and sync options | Minimal | QB-M1, QB-M2, QB-M6 | S-QB1, S-QB2 |
| Component 2 — first-connection matching | Minimal | QB-M3 | S-QB3 |
| Component 2 — review list for QuickBooks-created customers | Complete | QB-C1 | S-QB2 |
| Component 3 — Sync Log | Minimal | QB-M6 | S-QB2 |
| Component 4 — Needs Attention and retry queue | Minimal | QB-M6 | S-QB2 |
| Two-way contacts, in-app QuickBooks panel, more record types, job margin | Complete | QB-C2, QB-C4, QB-C5, QB-C6 | S-QB4 to S-QB6 |

## Screen-level spec

### Name of module

FINANCE | QuickBooks Online Integration

Type: Web Application · Category: Setup & Configuration · Menu: Settings › Integrations › QuickBooks Online

### Description

Each subscriber connects their own QuickBooks Online account to Estimate Master. After that, contacts, jobs, invoices and payments created in Estimate Master are sent to QuickBooks automatically. Payment status recorded in QuickBooks comes back to Estimate Master.

The goal is to match what Paint Scout already does for contractors who keep their books in QuickBooks. Tim's newest subscriber moved from Paint Scout and needs this to stay. Replacing QuickBooks with accounting inside Estimate Master is a separate, later phase (agreed on the 30 Sep call).

One rule keeps the two systems from disagreeing: every field has one owner. Estimate Master owns the work (contacts, jobs, what was sold). QuickBooks owns the books (what was paid, when, and how it was coded). This follows the existing Feature 33 design.

### What syncs, and which way

| Estimate Master record | QuickBooks record | Direction | When it syncs | Owner after first sync |
| --- | --- | --- | --- | --- |
| Contact (a lead converted to a customer) | Customer | Estimate Master → QuickBooks | When the contact is created or edited | Estimate Master |
| Job | Project, under that Customer | Estimate Master → QuickBooks | When the job is created (at estimate approval) | Estimate Master |
| Invoice (deposit, progress, final) | Invoice, linked to the Project | Estimate Master → QuickBooks | When the invoice is sent to the customer | Amount and date: QuickBooks |
| Payment taken in Estimate Master (Authorize.Net) | Payment, applied to the Invoice | Estimate Master → QuickBooks | When the payment succeeds | QuickBooks |
| Payment recorded in QuickBooks (cheque, cash, bank transfer) | Payment | QuickBooks → Estimate Master (status only) | Next sync after it is recorded | QuickBooks |
| Customer created in QuickBooks | Customer | QuickBooks → review list | Next sync after it is created | Decided in the review list |

Leads are never sent. A lead only becomes a QuickBooks Customer once it is converted to a contact in Estimate Master. This answers Tim's lead-versus-contact question from the call.

### Design sequence

1. An admin opens Settings › Integrations.
2. The system shows one card per available integration. The QuickBooks Online card shows its connection status.
3. The admin clicks Connect on the QuickBooks card.
4. The system opens the Intuit sign-in page in a pop-up window.
5. The admin signs in to QuickBooks and approves access for Estimate Master.
6. The pop-up closes and the card shows Connected, the QuickBooks company name, and the connection date.
7. The admin sets the sync options (see Component 1).
8. The admin clicks Start sync.
9. The system asks whether to send existing records:
   1. Send contacts and jobs from a chosen start date (default: first day of the current month).
   2. Send new records only, from now on.
10. The system matches existing contacts to QuickBooks Customers by email, then by exact name. Matches are listed for the admin to confirm before anything is sent.
11. The sync runs. Results appear in the Sync Log and any problems appear in Needs Attention.

### System behaviour

- Sync is automatic. A record syncs when it is saved in Estimate Master. No user presses a button for normal work.
- Records sync in order: Customer, then Project, then Invoice, then Payment. A child record waits until its parent exists in QuickBooks.
- Each sent record stores the QuickBooks ID it was given. A repeat send updates that record and never creates a duplicate.
- A failed send goes to the retry queue. The system retries after 1 minute, 5 minutes, 30 minutes and 2 hours. After the fourth failure it moves to Needs Attention.
- Sync runs around the clock. There is no business-hours window and no hourly batch, and nobody has to press Run or Retry for normal work. Retry stays available in Needs Attention for records that failed four times. (Decided 2 Oct 2026.)
- Once an invoice has been sent to QuickBooks, its amount and date are locked in Estimate Master. The edit controls show "Edit this invoice in QuickBooks".
- COMPLETE (QB-C3): If an invoice amount is changed in QuickBooks, the new amount shows in Estimate Master with a variance flag for the office manager.
- COMPLETE (QB-C3): If a record is deleted in QuickBooks, the local record is flagged for review. It is never deleted automatically.
- If the QuickBooks connection expires, sync pauses, the card shows Reconnect needed, and admins get an in-app notice. Records keep queuing and send once reconnected.
- Disconnecting stops all sync. Records already in QuickBooks stay there. QuickBooks IDs are kept so a reconnection to the same company does not create duplicates.
- Each organisation connects to exactly one QuickBooks company.

### Output

- Customers, Projects, Invoices and Payments created in the subscriber's QuickBooks Online company.
- The Integrations page with the QuickBooks card, Sync Log, Needs Attention list and Customer review list.
- A "QuickBooks" badge with a link on synced contacts, jobs and invoices.

### System validations

- A contact needs a display name before it can sync. QuickBooks rejects duplicate display names, so a clash with a different Customer goes to Needs Attention.
- An invoice cannot sync until its job has synced.
- A payment cannot sync until its invoice has synced.
- Amounts are sent in USD with two decimal places. Sales tax is sent as its own line, using the tax mapping chosen in sync options.
- Invoice numbers are sent as the Estimate Master invoice number. If QuickBooks already has that number, the record goes to Needs Attention.
- Start sync is disabled until the income account and tax mapping are set.

### Access validations

- QuickBooks is a paid add-on package. Only organisations subscribed to the QuickBooks add-on see the QuickBooks card and can connect. Other organisations see the card locked with "Add QuickBooks to your plan." (Decided 2 Oct 2026.)
- Only users with the Payment Configuration permission (`PAYMENT_CONFIG`) can connect, disconnect, change sync options, or confirm matches. Default: Owner and Admin roles.
- Users with Report View can see the Sync Log and Needs Attention list, but cannot act on them.
- Other users only see the QuickBooks badge on records.

### Activity logs

- Connect = Finance: QuickBooks Online company {CompanyName} connected by {User} at {Timestamp}.
- Disconnect = Finance: QuickBooks Online disconnected by {User} at {Timestamp}.
- Options = Finance: QuickBooks sync options changed by {User}: {Field} from {Old} to {New}.
- Sent = Finance: {RecordType} {RecordNo} sent to QuickBooks as {QBRef}.
- Failed = Finance: {RecordType} {RecordNo} failed to sync after {Attempts} attempts. Reason: {Error}.
- Variance = Finance: Invoice {InvoiceNo} amount changed in QuickBooks from {Sent} to {Current}.
- Deleted = Finance: QuickBooks record {QBRef} reported deleted. {RecordType} {RecordNo} flagged for review.
- Review = Finance: QuickBooks Customer {QBName} {linked to contact / created as contact / ignored} by {User}.

### Tables to use

| Insert into | Update | Source | Dependent |
| --- | --- | --- | --- |
| accounting\_connections, accounting\_sync\_queue, accounting\_sync\_log, accounting\_record\_links, accounting\_review\_items (all new; confirm table names) | customers, jobs, invoices, payments (sync status and QuickBooks ID) | customers, jobs, invoices, payments, tax\_regions | organisations, users, roles\_permissions |

### Wireframe design

- Header: page title "Integrations", breadcrumb Settings › Integrations.
- Left panel: Settings sub-menu, with a new Integrations item under Organization.
- Main panel:
  - Integration cards (QuickBooks Online first; Authorize.Net moves here as a card that links to its existing page).
  - QuickBooks detail view: status strip, sync options, Sync Log, Needs Attention, Customer review list.

### Acceptance criteria

- Given an organisation without the QuickBooks add-on, When an admin opens the QuickBooks settings, Then the card is locked with "Add QuickBooks to your plan" and no Connect button.
- Given a connected account, When a record fails to sync at 9 p.m. on a Sunday, Then it retries automatically at 1, 5, 30 and 120 minutes with no one pressing Retry.
- Given an admin with no QuickBooks connection, When they open Settings › Integrations, Then the QuickBooks card shows Not connected and a Connect button.
- Given a user without `PAYMENT_CONFIG`, When they open Integrations, Then the Connect button is hidden.
- Given a connected account, When a user converts a lead to a contact, Then a matching Customer appears in QuickBooks within 1 minute.
- Given a connected account, When an estimate is approved and a job is created, Then a Project appears under that Customer in QuickBooks.
- Given an invoice sent to the customer, When the sync runs, Then the same invoice number, lines, tax and total appear in QuickBooks, linked to the Project.
- Given a card payment taken through Authorize.Net, When it succeeds, Then a Payment is applied to that invoice in QuickBooks.
- Given a cheque recorded against the invoice in QuickBooks, When the next sync runs, Then the invoice in Estimate Master shows Paid and the payment date from QuickBooks.
- Given an invoice already in QuickBooks, When a user tries to edit its amount in Estimate Master, Then the edit is blocked with "Edit this invoice in QuickBooks".
- Given the same record is sent twice, When QuickBooks is checked, Then only one record exists.
- Given a lead that has not been converted, When the sync runs, Then nothing for that lead is sent.
- Given an expired connection, When a user saves an invoice, Then it queues, the card shows Reconnect needed, and it sends after reconnection.

## Component specs

### Component 1 — Connection card and sync options

Purpose: connect, check and disconnect the QuickBooks company, and choose how records map.

Controls:

- Connect: opens the Intuit sign-in pop-up. On success the card shows Connected.
- Reconnect: shown only when the connection has expired. Opens the same pop-up.
- Disconnect: opens a confirmation modal: "Stop syncing with {CompanyName}? Records already in QuickBooks stay there." Buttons: Cancel, Disconnect.
- Sync now: sends everything in the queue straight away. Disabled while a sync is running.
- Sync options (all required before Start sync):
  - Income account: dropdown of QuickBooks income accounts. Used on invoice lines.
  - Deposit account for payments: dropdown of QuickBooks bank accounts (for example, Chase checking).
  - Tax mapping: one row per Estimate Master tax region, each with a dropdown of QuickBooks tax codes.
  - Payment method for card payments: dropdown of QuickBooks payment methods. Default: Credit Card.

States:

- Not connected: grey badge, Connect button only.
- Connected: green badge, company name, connected by, connected on, last sync time.
- Syncing: blue badge "Syncing", with a spinner.
- Reconnect needed: amber badge, Reconnect button, banner "Sync is paused. {N} records are waiting."
- Error loading accounts: "Could not load your QuickBooks accounts. Try again." with a Retry link.

Acceptance criteria:

- Given the tax mapping is incomplete, When the admin looks at Start sync, Then the button is disabled with "Map every tax region first".
- Given the admin clicks Disconnect and confirms, Then the badge shows Not connected and no further records are sent.

### Component 2 — Customer matching and review list

Purpose: stop duplicate customers, and decide what happens to customers first created in QuickBooks.

System behaviour:

- On first connection, each existing contact is matched to a QuickBooks Customer when either the email or the exact display name is the same. Only one of the two needs to be present and equal. (Decided 2 Oct 2026.)
- The admin sees three groups: Matched (will link), No match (will be created in QuickBooks), and Possible duplicates. A Customer is a possible duplicate only when its email points to one contact and its name to a different contact, or its name matches more than one contact. The admin picks which contact to link.
- COMPLETE (QB-C1): After go-live, any Customer created directly in QuickBooks appears in the review list. It is never added as a lead or contact automatically.

Controls, per review item:

- Link to existing contact: opens a contact search. Links the two records. No new contact is made.
- Create as contact: creates a contact with the name, email, phone and address from QuickBooks.
- Ignore: hides the item. It can be restored from the Ignored filter.

Empty state: "No QuickBooks customers waiting for review."

Acceptance criteria:

- Given a contact and a QuickBooks Customer with the same email, When matching runs, Then they appear under Matched.
- Given a contact and a QuickBooks Customer with the same display name but no email on either, When matching runs, Then they appear under Matched.
- Given a contact and a QuickBooks Customer with the same email but different names, When matching runs, Then they appear under Matched.
- Given a Customer created in QuickBooks, When the next sync runs, Then it appears in the review list and not in Leads or Contacts.
- Given the admin picks Create as contact, Then a contact is created and linked, and the item leaves the list.

### Component 3 — Sync Log

Purpose: show what was sent and received, so the office can answer "did it go through?".

- Table columns: Time, Record type, Estimate Master number (link), QuickBooks reference, Direction, Result (Sent, Updated, Received, Failed).
- Filters: date range (default: last 7 days), record type, result.
- Newest first, 25 rows per page. Kept for 12 months.
- Empty state: "Nothing has synced in this period."

Acceptance criteria:

- Given an invoice was sent 10 minutes ago, When the admin opens the Sync Log, Then it is the top row with Result = Sent and its QuickBooks reference.

### Component 4 — Needs Attention and retry queue

Purpose: list every record that could not sync after four tries, plus variance and deletion flags, so nothing fails quietly.

- Each row shows the record, the reason in plain words (for example, "A different customer in QuickBooks already uses this name"), the first failure time, and attempts.
- Controls: Retry (sends again now), Open record (goes to the record in Estimate Master), Dismiss (only for variance and deletion flags, after review).
- The Integrations menu item shows a count badge when this list is not empty.
- Empty state: "Everything is in sync."

Acceptance criteria:

- Given a record fails four times, When the admin opens Needs Attention, Then it is listed with the QuickBooks error in plain words.
- Given the admin fixes the cause and clicks Retry, When the send succeeds, Then the row leaves the list and the Sync Log shows Sent.

### Out of scope for this phase

- Managing QuickBooks records from inside Estimate Master (Amlan's front-end option). Phase 2.
- Full two-way editing of the same field in both systems.
- Bills, receipts, supplier credits, payroll journals and bank reconciliation. These stay in the wider Feature 33 accounting module.
- QuickBooks Desktop. Online only.
