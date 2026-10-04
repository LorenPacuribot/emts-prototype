# CRM Lead Pipelines

## Version map

This spec is the Minimal version plus Group by source. The last section lists the Complete items that are not in Minimal (see the Scope tab). Screens are drawn in tab 6.

| Part of this spec | Version | Item IDs | Screen |
| --- | --- | --- | --- |
| Sales and Production boards, stage rules | Minimal | CRM-M1, CRM-M2 | S-CRM1, S-CRM2 |
| Component 1 — Pipeline Stages settings | Minimal | CRM-M2 | S-CRM2 |
| Component 2 — Board view | Minimal | CRM-M1 | S-CRM1 |
| Component 3 — Sold to Production handover | Minimal | CRM-M3 | S-CRM1 |
| Component 4 — Lead capture links and form | Minimal | CRM-M4, CRM-M5 | S-CRM3, S-CRM4 |
| Component 5 — Source badge and filter | Minimal | CRM-M6 | S-CRM1 |
| Component 5 — Group by source | Complete | CRM-C1 | S-CRM1 |
| Stage history | Minimal | CRM-M7 | S-CRM5 |
| Add pipeline, stage emails, automations, flow builder, Facebook Lead Ads, journey bar | Complete | CRM-C2 to CRM-C7 | S-CRM1, S-CRM3, S-CRM5 to S-CRM9 |

## Screen-level spec

### Name of module

CRM | Lead Pipeline (Sales and Production)

Type: Web Application · Category: Transactions · Menu: Lead Pipeline › Sales / Production

### Description

The Lead Pipeline becomes two boards. The Sales board tracks a lead from first contact until it is sold or lost. The Production board tracks a sold job from choosing colours until it is complete. Each organisation can add, rename and reorder its own stages on both boards.

Leads from the organisation's website, Facebook and Instagram arrive on the Sales board automatically, with their source already set. Nobody types them in and the customer is never asked where they came from.

This matches the Paint Scout set-up Tim showed on the 30 Sep call, and covers the two items he called urgent: outside forms flowing into the pipeline, and separate Sales and Production pipelines.

### How it works today

The live app has one board with seven fixed stages: New, Contacted, Scheduled, Pending, Sold, Lost, Archived. Settings › Pipeline Stages only lets an admin rename them. Lead sources Website, Facebook and Instagram already exist, but are picked by hand.

### Stage rules

Some stages are system stages. The dashboard, win rate and reports read them, so they can be renamed but not deleted or moved. All other stages are custom and fully editable.

| Board | Stage | Kind | Can rename | Can move | Can delete |
| --- | --- | --- | --- | --- | --- |
| Sales | New | System, always first | Yes | No | No |
| Sales | Contacted, Estimate Scheduled, Pending (today's stages) | Custom, pre-filled | Yes | Yes | Yes, when empty |
| Sales | Any stage the admin adds | Custom | Yes | Yes | Yes, when empty |
| Sales | Sold | System, second last | Yes | No | No |
| Sales | Lost | System, last | Yes | No | No |
| Production | Pick Colours, Ready to Schedule, Scheduled, In Progress, Touch-ups | Custom, pre-filled | Yes | Yes | Yes, when empty |
| Production | Complete | System, always last | Yes | No | No |

Archived stays as it is today: a hidden state reached through View Archived, not a board column.

Each board can have at most 12 stages, so the board stays readable on an iPad.

### Design sequence

1. User opens Lead Pipeline from the sidebar.
2. The system shows the Sales board by default, with a Sales / Production switch at the top.
3. User can:
   1. Drag a card between stages.
   2. Filter by source, estimator, or date received.
   3. COMPLETE (CRM-C1): Switch Group by between Stage (default) and Source.
   4. Open a card to see the lead or job.
4. When a card is dropped on Sold, the system creates a matching card in the first Production stage (Component 3).
5. Admins manage stages in Settings › Pipeline Stages (Component 1) and lead capture links in Settings › Lead Capture (Component 4).

### System behaviour

- A new lead from any capture link lands in the Sales board's New stage, with its source set.
- A card on Sold also appears on the Production board. The Sales card stays on Sold as the sales record.
- Moving a card out of Sold asks: "This job is already on the Production board. Remove it from Production too?" Options: Keep in Production, Remove from Production, Cancel.
- The contact's pipeline status bar (on the contact and lead details pages) shows the current stage on each board.
- Stage changes happen only when a person moves a card. No automations in this phase.
- Nothing is sent to the customer when a card moves.

### Output

- Sales board and Production board, each as a board view and the existing table view.
- A stage history on each lead and job: stage, moved by, moved at.

### System validations

- Stage names are required, up to 30 characters, and unique within their board.
- A stage with cards in it cannot be deleted. The admin must move the cards first; the message names how many are there.
- System stages cannot be deleted or reordered.
- A board needs at least one custom stage between its system stages.
- Sources are a list each organisation manages. It starts with built-in sources that cannot be deleted: Website, Facebook, Instagram, Google, Referral, Repaint alert, Manual, Other. Admins can add any other platform (for example Nextdoor, Thumbtack, Angi, Yard Sign), rename or deactivate the ones they added, and pick any active source when making a tracked link. Source names are required, up to 30 characters, and unique. A source with leads can be deactivated but not deleted. (Decided 2 Oct 2026.)
- Admins manage the source list in Settings › Pipeline Stages, on a Lead sources tab beside Sales and Production.

### Access validations

- Only users with Admin Master Data (`ADMIN_MASTER_DATA`) can add, rename, reorder or delete stages, and manage lead capture links.
- Only users with Admin Master Data can add, rename or deactivate lead sources.
- Any user who can see leads today can move cards on the Sales board.
- Users with job permissions can move cards on the Production board.

### Activity logs

- Stage added = CRM: Stage {StageName} added to {Board} by {User} at position {Position}.
- Stage renamed = CRM: Stage {OldName} renamed to {NewName} on {Board} by {User}.
- Stage moved = CRM: Stage {StageName} moved from position {Old} to {New} on {Board} by {User}.
- Stage deleted = CRM: Stage {StageName} deleted from {Board} by {User}.
- Card moved = CRM: {LeadNo} moved from {FromStage} to {ToStage} on {Board} by {User}.
- Handover = CRM: {LeadNo} sold. Production card created for {JobNo} in {StageName}.
- Captured = CRM: {LeadNo} received from {Source} via link {LinkName}.

### Tables to use

| Insert into | Update | Source | Dependent |
| --- | --- | --- | --- |
| pipelines, pipeline\_stages (new; confirm names), lead\_stage\_history, leads, lead\_capture\_links (new; confirm name) | leads, jobs, pipeline\_stages | leads, customers, jobs, users | estimates, dashboard\_widgets, reports |

### Wireframe design

- Header: "Lead Pipeline", Sales / Production switch, search, View Archived, Add New Lead (Sales only).
- Left panel: main sidebar (unchanged).
- Main panel:
  - Filter bar: Source, Estimator, Date received, Group by (Stage / Source), Board / Table toggle.
  - Board columns, one per stage, each with the stage name, colour bar and card count.
  - Cards: name, city, lead number, source badge, received date, next follow-up, phone and email actions.

### Acceptance criteria

- Given the Sales board, When the user opens Lead Pipeline, Then Sales shows by default and the switch offers Production.
- Given an admin adds a stage "Estimate Sent" after Estimate Scheduled, When the board loads, Then it appears in that position for every user in the organisation.
- Given a stage holding 3 cards, When the admin tries to delete it, Then deletion is blocked with "Move the 3 cards in this stage first."
- Given a user without `ADMIN_MASTER_DATA`, When they open Pipeline Stages, Then all edit controls are hidden.
- Given a card is dropped on Sold, Then a card for the same job appears in Pick Colours on the Production board.
- Given a card moves, When the customer's inbox is checked, Then no email or text was sent.
- Given the dashboard win rate before a new custom stage is added, When the stage is added, Then the win rate is unchanged.

## Component specs

### Component 1 — Pipeline Stages settings

Purpose: let the admin shape both boards to how their business works. This replaces today's rename-only screen.

Design sequence:

1. Admin opens Settings › Pipeline Stages.
2. Tabs at the top: Sales, Production.
3. Each stage shows as a row with a drag handle, name field, colour picker and delete icon. System stages show a lock icon instead of the handle and delete icon.
4. Add stage opens a new blank row directly above the next system stage.
5. Admin clicks Save changes. Nothing applies until saved.

Controls:

- Drag handle: reorders custom stages. Custom stages cannot be dragged past a system stage.
- Colour picker: 8 preset colours. Default: the next unused colour.
- Delete (bin icon): if the stage is empty, it removes the row. If not, it shows "Move the {N} cards in this stage first."
- Add stage: disabled at 12 stages, with "A board can have up to 12 stages."
- Save changes: disabled until something changes. Discard changes resets the form.

Acceptance criteria:

- Given an unsaved change, When the admin leaves the page, Then the system asks "Discard unsaved changes?"
- Given a lock icon on Sold, When the admin tries to drag it, Then it does not move.

### Component 2 — Board view

Purpose: show where every lead or job is, at a glance, and move it on.

System behaviour:

- Columns load in the saved stage order. Each shows its card count.
- Cards within a column sort newest first.
- Dragging a card saves straight away and shows a toast: "{Name} moved to {Stage}."
- On iPad, cards can be moved by long-press and drag, or with a Move to menu on the card.

Empty states:

- Empty column: "No leads here."
- Empty board: "No leads yet. Share your lead capture link to start receiving them." with a link to Settings › Lead Capture.

Acceptance criteria:

- Given the user drags a card from Contacted to Pending, Then the card stays in Pending after a page refresh.
- Given an iPad in landscape, When the Sales board loads, Then every column is reachable by horizontal scroll and no column sits behind the sidebar.

### Component 3 — Sold to Production handover

Purpose: a sold job moves into production without anyone re-entering it.

- Trigger: a Sales card reaches Sold, either by drag or because its estimate was approved.
- Result: one Production card, linked to the same contact, estimate and job, placed in the first Production stage.
- A job never has more than one Production card. A repeat trigger (for example, an amended estimate re-approved) does not add another.
- The Production card shows the job number, address, sold value and scheduled start date once a date exists.

Acceptance criteria:

- Given an estimate is approved, Then its lead moves to Sold and a Production card appears in Pick Colours.
- Given an amended estimate is re-approved, Then no second Production card is created.

### Component 4 — Lead capture links

Purpose: bring leads in from outside Estimate Master automatically, with the source already known. This delivers CR-5 from 23 Sep.

How it works, in plain words: each organisation gets its own hosted "Request a free estimate" form. The admin then makes one tracked link per place they will share it, such as Facebook, Instagram or the website. The link carries a tag that tells Estimate Master where the visitor came from. Because the form is hosted by Estimate Master, it does not depend on how the subscriber's website stores its own form data.

Design sequence:

1. Admin opens Settings › Lead Capture.
2. The system shows the organisation's form link and a preview of the form, with the company logo and name.
3. Admin clicks Add link, enters a name (for example, "Facebook page") and picks a source from the list.
4. The system creates a link in the form `https://app.estimate-master.com/f/{org-slug}?src={source}&l={link-id}`, with Copy link and Download QR code buttons.
5. Admin pastes the link on Facebook, Instagram, the website, or prints the QR code.

Form fields, as the visitor sees them:

| Field | Type | Required | Validation |
| --- | --- | --- | --- |
| Full name | Text | Yes | 2 to 80 characters |
| Phone | Phone | One of phone or email | US format, 10 digits |
| Email | Email | One of phone or email | Valid email format |
| Property address | Address lookup | No | — |
| What would you like painted? | Dropdown: Interior, Exterior, Both, Cabinets, Other | No | — |
| Message | Long text | No | Up to 1,000 characters |

System behaviour:

- On submit, a lead is created in the Sales board's New stage, and the visitor sees "Thanks, we've received your request and will be in touch soon."
- Source is set in this order: the link's source tag; if none, the site the visitor came from (facebook.com → Facebook, instagram.com → Instagram, google → Google); if neither, Website.
- The lead records the link name it came through, so two Facebook links can be told apart.
- If the email or phone matches an open lead, the new lead is created and marked "Possible duplicate" with a link to the other lead.
- Admins and the organisation's default estimator (a new organisation setting; new website leads are assigned to them) get an in-app notification: "New lead from {Source}: {Name}."
- No email or text is sent to the visitor automatically.
- Spam protection: a hidden honeypot field, and no more than 5 submissions per hour from one address.

Controls:

- Add link: opens the Add link modal (name, source). Save creates the link.
- Copy link: copies it and shows "Link copied."
- Download QR code: downloads a PNG.
- Pause: the link shows "This form is not accepting requests right now." Resume turns it back on.
- Each link shows the number of leads received in the last 30 days.

Acceptance criteria:

- Given the Facebook link, When a visitor submits the form, Then a lead appears in New with source Facebook within 10 seconds.
- Given the plain form link opened from an Instagram bio, When submitted, Then the source is Instagram.
- Given neither a tag nor a known referring site, When submitted, Then the source is Website.
- Given an admin adds the source "Nextdoor" and makes a tracked link for it, When a visitor submits through that link, Then the lead's source is Nextdoor and Nextdoor appears in the Source filter and Group by Source.
- Given a source that has leads, When the admin tries to delete it, Then only Deactivate is offered and existing leads keep the source.
- Given the phone and email are both blank, When the visitor submits, Then the form blocks it with "Please give us a phone number or email."
- Given a paused link, When a visitor opens it, Then the form does not show and no lead is created.

### Component 5 — Source badge, filter and Group by source

Purpose: give Tim his "Facebook leads" and "Instagram leads" view without mixing where a lead came from with where it is in the journey.

- Every card shows a small source badge.
- The Source filter shows only leads from the chosen sources. It remembers the choice per user.
- COMPLETE (CRM-C1): Group by: Source changes the columns to one per source, with each card still showing its stage. Dragging between source columns is disabled, because a lead's source does not change.
- Group by: Stage returns to the normal board.

Acceptance criteria:

- Given Group by Source, When the board loads, Then there is one column per source that has at least one lead.
- Given Group by Source, When the user tries to drag a card to another column, Then the card snaps back.

### Complete version only (not in Minimal)

- Adding extra pipelines (for example, Marketing). The data model supports it; it ships later with the paid tiers.
- Automations ("if this happens, move the card and send this email"). Tim called these "an expanded version".
- Direct Facebook Lead Ads and Instagram Lead Form connections, where the form lives inside Facebook. The tracked link covers the posts, pages and bios.
- Tier gating. When tiers are built, CRM features will be switched on per plan.
