# Job Scheduling Email Notifications

## Version map

This spec mixes both versions. Minimal is: no email on save, the Changes not sent marker, the Unsent changes button with the Notify crew modal, and the summary email. The rest is Complete. Screens are drawn in tab 6.

| Part of this spec | Version | Item IDs | Screen |
| --- | --- | --- | --- |
| No email on save; snapshot rule | Minimal | JS-M1 | S-JS1 |
| Changes not sent marker | Minimal | JS-M2 | S-JS1 |
| Unsent changes button and Notify crew modal | Minimal | JS-M3 | S-JS1, S-JS2 |
| Component 3 — Schedule Update summary email | Minimal | JS-M4 | S-JS3 |
| Component 1 — Send Email in the Edit Shift popup | Complete | JS-C1 | S-JS4 |
| Component 2 — Notify step straight after Bulk Reschedule | Complete | JS-C2 | S-JS5 |
| Component 4 — Email Events settings | Complete | JS-C3 | S-JS6 |
| "Not delivered" status per person | Complete | JS-C4 | S-JS2 |
| Text message option | Complete | JS-C5 | S-JS2, S-JS6 |
| Spanish summary email | Complete | JS-C6 | S-JS3 |

## Screen-level spec

### Name of module

OPERATIONS | Crew Schedule Notifications

Type: Web Application · Category: Transactions · Menu: Job Scheduling

### Description

Changing the schedule no longer emails the crew by itself. The scheduler decides when to tell people, and who to tell. Each person gets one summary email listing all of their changed jobs, instead of one email per save.

Today the Work Order Assignment email fires on every create or edit. After adjusting eight to ten jobs on 23 Sep, Tim's crew received 23 emails. Crews stop reading them, and Tim avoids adjusting the schedule. This spec delivers CR-3 from 23 Sep, plus the summary email and recipient choice Tim asked for on 30 Sep.

### Design sequence

1. User opens Job Scheduling.
2. User makes changes: adds, edits, moves or cancels shifts, or uses Bulk Reschedule.
3. The system saves each change but sends nothing. Changed jobs show a "Changes not sent" marker.
4. User tells the crew in one of three ways:
   1. Send Email in the Edit Shift popup, for one job (Component 1).
   2. The Notify crew step after Bulk Reschedule (Component 2).
   3. The Unsent changes button in the scheduler header, for everything waiting (Component 2).
5. User picks recipients. Everyone affected starts ticked.
6. User clicks Send updates. Each ticked person gets one summary email (Component 3).
7. Markers clear for the people who were sent their update.

### System behaviour

- No crew email is sent when a shift is created, edited, moved or cancelled. Emails go only when a user clicks Send.
- The system keeps a snapshot of what each person was last told about each job. "Unsent" means the job differs from that snapshot for at least one person.
- If a change is undone before sending, so the job matches the snapshot again, the marker clears.
- A person removed from a job is included, with the job listed under "Removed from".
- Sending never changes the schedule itself.
- The email content comes from the template. It cannot be edited at send time.
- Customer-facing emails are not part of this change.

### Output

- Schedule Update summary email to each chosen person.
- "Changes not sent" markers on job bars and cards.
- A Notifications section in each job's activity, showing who was sent what and when.

### System validations

- Send updates is disabled when no one is ticked.
- A person with no email address is shown unticked and greyed out, with "No email on file".
- One email per person per send, however many jobs changed.
- COMPLETE (JS-C4): An email that fails to deliver keeps that person's marker and shows "Not delivered" next to their name.

### Access validations

- Users who can edit the schedule can send updates.
- Users who can only view the schedule see markers but not the Send controls.

### Activity logs

- Sent = Scheduling: Schedule update sent to {Employee} by {User} covering {JobCount} jobs: {JobNos}.
- Skipped = Scheduling: {Employee} unticked by {User}. Update not sent for {JobNos}.
- Failed = Scheduling: Schedule update to {Employee} not delivered. Reason: {Error}.

### Tables to use

| Insert into | Update | Source | Dependent |
| --- | --- | --- | --- |
| schedule\_notifications, schedule\_notification\_snapshots (new; confirm names) | schedule\_notification\_snapshots | job\_shifts, shift\_assignments, users, jobs | email templates (automated messages), activity log |

### Wireframe design

- Header: Job Scheduling title, date navigation, Day / Week / Month, Bulk Reschedule, and a new Unsent changes (N) button.
- Left panel: main sidebar (unchanged).
- Main panel: calendar with job bars. Bars with unsent changes show an envelope icon with a dot.

### Acceptance criteria

- Given a user edits a shift and saves, When the assigned employee's inbox is checked, Then no email has arrived.
- Given 20 jobs rescheduled for the same employee, When the user sends updates, Then that employee receives exactly one email listing all 20.
- Given a user unticks an employee, When updates are sent, Then that employee receives nothing and their marker stays.
- Given a user moves a job and then moves it back, Then the marker clears without any email.
- Given a view-only user, When they open Job Scheduling, Then the Unsent changes button and Send Email buttons are hidden.

## Component specs

### Component 1 — Send Email in the Edit Shift popup · COMPLETE (JS-C1)

Purpose: tell the crew about one job, right after changing it.

- Location: Edit Shift popup footer, left of Assign shift. Label: Send Email.
- Clicking it saves any unsaved change first, then opens the recipient list for this job only.
- Recipient list: every person assigned now, plus anyone removed since the last send. Each row shows name, role, and what changed for them (Added, Dates changed, Removed).
- Buttons: Cancel, Send updates.
- Toast after sending: "Update sent to {N} people."

Acceptance criteria:

- Given a job with 3 crew and no changes since the last send, When the popup opens, Then Send Email is disabled with the tooltip "No changes to send."
- Given Braden was removed from the job, When the recipient list opens, Then Braden is listed with "Removed".

### Component 2 — Notify crew after Bulk Reschedule, and Unsent changes

Purpose: tell everyone about a batch of changes in one go.

- COMPLETE (JS-C2): After Bulk Reschedule is applied, a modal opens: "Notify crew about these changes?"
- The Unsent changes (N) button in the header opens the same modal, covering every job with unsent changes. N = number of people waiting.
- The modal lists each affected person with a tick box, the number of jobs changed for them, and an expand arrow that shows the job list.
- Controls: Select all, Clear all, Send updates, Not now.
- Not now closes the modal and leaves the markers, so nothing is lost.
- Empty state (header button): the button is hidden when nothing is waiting.

Acceptance criteria:

- Given a bulk reschedule of 8 jobs affecting 5 people, When it is applied, Then the modal lists 5 people, all ticked.
- Given the user clicks Not now, When they later click Unsent changes, Then the same 5 people are listed.

### Component 3 — Schedule Update summary email

Purpose: one clear email per person that they can act on.

- Subject: "Schedule update from {Company}: {N} jobs changed".
- Body sections, in order:
  1. New jobs: job name, address, start and end dates, shift times, crew lead.
  2. Changed jobs: same details, with the old dates crossed through beside the new ones.
  3. Removed from: job name and the dates they are no longer needed.
- Each job links to its work order in the app.
- A section with nothing in it is left out.
- Template lives in Settings › Automated Messages as "Schedule Update (crew)". Admins can edit the wording; the job list is filled in by the system.
- COMPLETE (JS-C6): Language follows the employee's language setting (English or Spanish, once EMTS-339 ships).

Acceptance criteria:

- Given a person added to 1 job and moved on 2 others, When they are sent the update, Then the email shows 1 under New jobs and 2 under Changed jobs, and no Removed from section.
- Given a changed job, When the email is opened, Then the old dates show crossed through beside the new ones.

### Component 4 — Automated email events (to be completed from Tanmoy's list) · COMPLETE (JS-C3)

Purpose: record, for every email the system sends, whether it stays automatic or becomes manual. Tanmoy is preparing the full list. Tim then marks each one.

| Event | Who receives it | Today | Decision |
| --- | --- | --- | --- |
| Shift created, edited, moved or cancelled (Work Order Assignment) | Assigned crew | Automatic on every save | Manual, through this spec |
| Other events | From Tanmoy's list | — | Tim to decide |

Until the list is complete, every other email keeps its current behaviour.
