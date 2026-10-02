# Final Design v1.0 — Fourteen Selected Features

*Estimate Master — User Stories and Final Design · Combined feature design specification · Version 1.0 · 23 September 2026*

This is the approved final design for the fourteen selected patent features. Each feature has its own sub-tab under this one. Every sub-tab follows the same shape: User Story, Screen-Level Specification, Component Specifications, and Requirement Traceability. This tab holds what all fourteen share: how to read them, the six cross-feature rules, the launch gates, and document control.

The approved user stories and acceptance criteria from the client requirements are combined here with the final design that development and QA build and test from. Where the client requirements recorded a question (a Q item) and the business owner answered it, that answer is written in as a confirmed rule, with the original Q reference kept beside it. Nothing in this design is marked pending.

Tabs 1 to 7 cover the 30 Sep call features (QuickBooks, CRM, scheduling emails, amended estimates, Books) and the prototype fit. Where a 30 Sep spec changes one of these fourteen features (for example, Feature 33 Accounting gains Estimate Master Books), the 30 Sep tab says so. These sub-tabs remain the baseline.

## The fourteen features

Each feature below is its own sub-tab, with the v1.0 text unchanged. All fourteen are complete.

- Feature 3 — Project-Specific Color Card: 3 · Project-Specific Color Card
- Feature 18 — Material Calculation And Order Generation: 18 · Material Calculation And Order Generation
- Feature 19 — Supplier Integration: 19 · Supplier Integration
- Feature 21 — Estimated Versus Actual Performance: 21 · Estimated Versus Actual Performance
- Feature 22 — Employee Hours And Payroll: 22 · Employee Hours And Payroll
- Feature 24 — Change Orders And Additional Work: 24 · Change Orders And Additional Work
- Feature 25 — Historical Property Paint Record: 25 · Historical Property Paint Record
- Feature 26 — Customer QR Paint Record: 26 · Customer QR Paint Record
- Feature 27 — Paint Life And Automated Repainting Alerts: 27 · Paint Life And Automated Repainting Alerts
- Feature 28 — Future Estimating And Reordering: 28 · Future Estimating And Reordering
- Feature 29 — Repainting Follow-Up Workflow: 29 · Repainting Follow-Up Workflow
- Feature 30 — Estimating Performance Feedback: 30 · Estimating Performance Feedback
- Feature 33 — Financial And Accounting Management: 33 · Financial And Accounting Management
- Feature 34 — Social Media And Marketing Management: 34 · Social Media And Marketing Management

## How To Read This Document

**Structure of each feature**

Every feature follows the same shape.

- User Story — the approved stories, written as the client agreed them.
- Screen-level spec — the twelve standard sections, from Name Of Module through Acceptance Criteria.
- Component specs — one block per panel, widget or workflow step inside the feature, each with its own behavior, validations, controls, states and acceptance checks.
- Requirement traceability — a short table mapping the client's A-item numbers to the sections that cover them.

**Terms used throughout**

- Surface — one painted area of a property, such as a wall, a ceiling, a door or an exterior elevation. Surfaces are the smallest unit the system tracks for colour, coverage and repaint timing.
- Specification (or spec line) — one colour applied a particular way. It holds sheen, number of coats, primer, coat sequence and the surfaces it applies to. One colour can have several specifications.
- Application — one recorded event of paint being applied to a surface, with its date and product details. Property history is a list of applications.
- Coat-adjusted area — measured area multiplied by the number of coats. A 1,000 square foot wall painted twice is 2,000 coat-adjusted square feet.
- Signed scope — the work the customer has signed a contract for. Once scope is signed, changes follow the change order rule below.
- Approved hours — time entries a manager has approved. Only approved hours appear in job costing and payroll export.

## Cross-Feature Rules

Six rules decide behavior in more than one feature. They are stated once here, and each feature refers back to them rather than restating them differently. This is deliberate: the client requirements recorded conflicts where the same rule was worded three ways, and those conflicts were resolved into the single versions below.

### Rule 1 — The signed-scope change rule (from 19.Q01)

This rule governs features 3, 19, 24 and 28 with no variation between them.

- A change that keeps the same brand, same product line, same colour and same sheen, and differs only in pack size or a manufacturer-published direct successor product, with cost within 10 percent, is approved by the office manager alone. No customer document is needed.
- A change of brand, product line, colour or sheen on a signed job is a priced change order with the customer's signature. This applies even when the price change is zero.
- A direct successor product inside a changed product line never qualifies for office-only approval, however the manufacturer describes it.
- The "would the customer notice" test is removed. Section 28's earlier appearance-or-sheen wording is superseded by this rule.
- The Colour Re-approval record is a separately numbered document used only when there is no price change, no affected paint has been tinted or ordered, and brand, product line and sheen do not change. It is never widened beyond that.
- No verbal approval qualifies for any of the above.

### Rule 2 — The outstanding demand formula (from 19.Q02)

One formula, used everywhere a quantity balance is shown.

- Outstanding demand = calculated demand − reserved shelf stock − net acknowledged quantity.
- Net acknowledged quantity = acknowledged − confirmed cancellations − confirmed returns.
- Orderable now = outstanding demand − sent-but-unacknowledged holds.
- A sent quantity stays visible as demand and is blocked from being ordered again, but it is not netted off until the supplier acknowledges it.
- Cancellation means the supplier confirming they will not supply a quantity they previously acknowledged. It only ever reduces the acknowledged figure. A cancellation request the supplier has not confirmed changes nothing.
- Because outstanding demand subtracts acknowledged quantity, a cancelled quantity returns to outstanding exactly once. Nothing is ever added back on a separate line.

### Rule 3 — The actual wage cost source (from 22.Q01)

Estimate Master holds no pay rates and calculates no pay.

- After each Gusto payroll run, the bookkeeper enters or imports one approved labour cost total per employee per pay period, plus the burden percentage.
- Estimate Master allocates that total across jobs in proportion to the approved hours it already holds.
- Salaried staff whose time is job-coded receive a period cost from the bookkeeper, allocated the same way.
- Only the bookkeeper and the business owner can see per-employee totals. Everyone else sees allocated job cost only.
- Allocated cost for a period must equal the entered total exactly. The office manager checks this monthly.

### Rule 4 — The closed list of customer-facing messages (from 24.Q01)

These are the only messages the system sends to customers. Nothing may be added without the business owner's written approval.

- Change order sent, and change order approved.
- Repaint follow-up outreach.
- QR record delivery, when requested by the customer or by the business.
- Shared-record correction notices for colour, product, sheen, coats or location.
- The business-closure PDF.
- The touch-up request acknowledgment.
- Sending estimates and invoices.

Every one of these requires a person to press send. The single exception is the touch-up acknowledgment, which is an automatic reply to something the customer has just submitted themselves.

### Rule 5 — Deterministic tie-breaking

- Where a rounding residual or an allocation remainder must go to one job and two jobs tie, it goes to the lowest job number. This applies in feature 22 (time rounding) and feature 33 (financial allocation).
- Where a residual is assigned by size rather than by tie, it goes to the largest allocation first, then to the lowest job number if those tie.

### Rule 6 — Rounding and precision

- Money rounds to cents using half-up rounding.
- Material quantities carry full precision through the whole calculation and round once, at the end. Base need is not rounded. It is multiplied by one plus the waste allowance, and only that final figure is rounded to three decimals before container packing (18.Q01).
- Displayed two-decimal values are never used as inputs to a further calculation.

## Launch Gates And Client Inputs

Several items must be supplied by named people before specific build or launch stages. They are collected here so nothing is discovered late.

| Item | Who supplies it | Due before |
| --- | --- | --- |
| Written Sherwin-Williams data-use permission | Business owner | User acceptance testing and library publication (feature 3) |
| Two branch setup records: name, store number, account number, phone | Business owner | Supplier setup (feature 19) |
| Supplier working calendar and product mappings | Office manager | First supplier order (feature 19) |
| State and written work-rule register | Bookkeeper | Build (feature 22) |
| Gusto CSV mapping | Bookkeeper | Build (feature 22) |
| Gusto non-taxable reimbursement mapping, in writing | Bookkeeper | Go-live (feature 22) |
| Configured local timezone | Business owner | Build (features 22, 27, 29, 34) |
| Approved labour cost totals per employee per pay period, plus burden percentage | Bookkeeper | Each payroll run (Cross-Feature Rule 3) |
| PaintScout and Excel exports, plus migration review | Office manager | Migration (feature 25) |
| Individual approval of each property merge and unit renumbering | Business owner | Migration (feature 25) |
| Business logo and phone number for printed QR formats | Business owner | QR card printing (feature 26) |
| Owner-approved historical productivity policy, per property type | Business owner | Historical productivity reuse (feature 28) |
| Written state texting rules | Business owner and bookkeeper | Texting release (feature 29) |
| Chart of accounts, categories, accounting mappings, jurisdiction and effective tax rules | Bookkeeper | Build (feature 33) |
| Approved job-cost codes | Business owner | Build (feature 33) |
| Written confirmation of whether Gusto posts the payroll journal | Bookkeeper | Build (feature 33) |
| Recent-month acceptance sample, plus sign-off | Business owner and bookkeeper | Finance acceptance (feature 33) |
| Facebook and Instagram business account IDs and administrator access | Business owner | Marketing setup (feature 34) |
| Image templates at 1080x1080 and 1080x1350, plus brand colours | Office manager | Marketing setup (feature 34) |
| Website form platform confirmation and mandatory lead fields | Office manager | Website integration build (feature 34) |
| Photo-release wording review | Business owner and bookkeeper | Marketing launch (feature 34) |

## Document Control

| Field | Value |
| --- | --- |
| Document | Estimate Master — User Stories and Final Design |
| Version | 1.0 |
| Date | 23 September 2026 |
| Source | Estimate Master Client Requirements, Refined review edition 2 (fourteen selected features), with recorded owner answers folded in as confirmed rules |
| Features covered | 3, 18, 19, 21, 22, 24, 25, 26, 27, 28, 29, 30, 33, 34 |
| Audience | Development, QA, project management, client review |
| Status of Q items | All recorded answers are written into the specification as confirmed rules. The original Q references are retained in each feature's traceability table. |
| Added to this doc | 1 Oct 2026, converted from the v1.0 source file with the content unchanged |
