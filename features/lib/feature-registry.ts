/**
 * Every new feature in the prototype, in one list (New Features panel).
 *
 * The dashboard panel reads it to list the features and where to find them;
 * the gates (features/components/ui/live.tsx FeatureGate) read the same keys
 * to show or hide each feature's parts. Names follow the feature headers in
 * the code ("Feature N — …").
 *
 * Built features (the 14 patent features) have no Minimal / Complete split:
 * their Minimal switch is "the feature as built". The 30 Sep call features
 * list their item IDs (QB-M1 …) under Minimal and Complete.
 */

export type FeatureKey =
  | "f3" | "f18" | "f19" | "f21" | "f22" | "f24" | "f25" | "f26" | "f27" | "f28" | "f29" | "f30" | "f33" | "f34"
  | "qb" | "crm" | "js" | "rp" | "bk";

export interface FeatureDef {
  key: FeatureKey;
  group: "built" | "sep30";
  /** Patent feature number (built features). */
  number?: number;
  /** Item prefix (30 Sep features). */
  prefix?: string;
  name: string;
  breakdown: string;
  where: { label: string; href: string }[];
  parts: { minimal: string[]; complete: string[] };
  /** False: listed as "Not built yet", switches disabled. */
  built: boolean;
}

export const FEATURES: FeatureDef[] = [
  {
    key: "f3", group: "built", number: 3, name: "Project-Specific Color Card",
    breakdown: "Lists each paint color, product and sheen for a job, with versions and customer approval.",
    where: [{ label: "Estimates › estimate › Paint Colors", href: "/estimates" }, { label: "Settings › Paint Library", href: "/settings/paint-library" }],
    parts: { minimal: ["Paint Colors section on the estimate", "Color card versions and print", "Customer color approval", "Color numbers on surfaces"], complete: [] }, built: true,
  },
  {
    key: "f18", group: "built", number: 18, name: "Material Calculation and Order Generation",
    breakdown: "Works out paint and materials from the estimate, with waste and container sizes, and builds the order.",
    where: [{ label: "Estimates › estimate › Paint & Materials", href: "/estimates" }, { label: "Settings › General Configuration", href: "/settings/general" }],
    parts: { minimal: ["Preliminary list", "Paint & Materials with waste and containers", "Waste and container settings"], complete: [] }, built: true,
  },
  {
    key: "f19", group: "built", number: 19, name: "Supplier Integration",
    breakdown: "Sends purchase orders to supplier branches and tracks acknowledgment, pickup and returns.",
    where: [{ label: "Supplier Orders", href: "/supplier-orders" }, { label: "Settings › Suppliers", href: "/settings/suppliers" }],
    parts: { minimal: ["Supplier Orders board", "Returns", "Suppliers and product mapping settings", "Dashboard supplier card"], complete: [] }, built: true,
  },
  {
    key: "f21", group: "built", number: 21, name: "Estimated Versus Actual Performance",
    breakdown: "Compares estimated cost and hours with what the job really used.",
    where: [{ label: "Reports › Estimated vs Actual", href: "/reports?tab=job_performance" }, { label: "Jobs › job › cost and hours", href: "/jobs" }],
    parts: { minimal: ["Estimated vs Actual report", "Cost and hours card on the job"], complete: [] }, built: true,
  },
  {
    key: "f22", group: "built", number: 22, name: "Employee Hours and Payroll",
    breakdown: "Crew clock-in and clock-out, approvals, disputes, mileage and payroll export.",
    where: [{ label: "Time", href: "/time" }, { label: "Work Orders › crew clock", href: "/work-orders" }, { label: "Job Scheduling › crew actual hours", href: "/job-scheduling" }],
    parts: { minimal: ["Time module", "Crew clock and logged hours on work orders", "Crew actual hours on the schedule", "Dashboard time card"], complete: [] }, built: true,
  },
  {
    key: "f24", group: "built", number: 24, name: "Change Orders and Additional Work",
    breakdown: "Adds, removes or credits work on a signed estimate, with the Amend rule and customer approval.",
    where: [{ label: "Estimates › estimate › Change Orders", href: "/estimates" }, { label: "Work Orders › change orders", href: "/work-orders" }],
    parts: { minimal: ["Change Orders section", "Amend Estimate", "Change orders on work orders, invoices and history", "Dashboard change order cards"], complete: [] }, built: true,
  },
  {
    key: "f25", group: "built", number: 25, name: "Historical Property Paint Record",
    breakdown: "Keeps every past job and the paint used at an address, and who owns it now.",
    where: [{ label: "Contacts › contact › Paint History", href: "/contacts" }, { label: "Work Orders › paint record", href: "/work-orders" }],
    parts: { minimal: ["Paint History tab", "Paint record on work orders", "Owners and consent"], complete: [] }, built: true,
  },
  {
    key: "f26", group: "built", number: 26, name: "Customer QR Paint Record",
    breakdown: "A QR link the customer opens to see their paint record.",
    where: [{ label: "Contacts › contact › Paint History", href: "/contacts" }, { label: "Repaint Alerts › QR links", href: "/repaint-alerts" }],
    parts: { minimal: ["QR paint record and passport", "Public paint record page"], complete: [] }, built: true,
  },
  {
    key: "f27", group: "built", number: 27, name: "Paint Lifespan and Repaint Alerts",
    breakdown: "Flags surfaces when their paint is due for renewal, from the lifespan library.",
    where: [{ label: "Repaint Alerts", href: "/repaint-alerts" }, { label: "Settings › Repaint Intervals", href: "/settings/repaint-intervals" }],
    parts: { minimal: ["Repaint Alerts queue", "Lifespan library and run log", "Repaint Intervals settings"], complete: [] }, built: true,
  },
  {
    key: "f28", group: "built", number: 28, name: "Future Estimating and Touch-Up Reordering",
    breakdown: "Builds a new estimate from past work and re-orders the same touch-up paint.",
    where: [{ label: "Estimates › From history", href: "/estimates" }, { label: "Contacts › contact › reorders", href: "/contacts" }],
    parts: { minimal: ["New estimate from history", "Touch-up reorders", "From-history filter on estimates"], complete: [] }, built: true,
  },
  {
    key: "f29", group: "built", number: 29, name: "Repainting Follow-Up Workflow",
    breakdown: "Assigns and tracks follow-up attempts for repaints that are due.",
    where: [{ label: "Repaint Alerts › Follow-ups", href: "/repaint-alerts/follow-ups" }, { label: "Leads › repaint follow-up", href: "/leads" }],
    parts: { minimal: ["Follow-ups and monthly measures", "Repaint alert source and lock on leads", "Repaint follow-up card on leads"], complete: [] }, built: true,
  },
  {
    key: "f30", group: "built", number: 30, name: "Estimating Performance Feedback",
    breakdown: "Shows where estimates ran over or under, to improve the rates.",
    where: [{ label: "Reports › Estimating Feedback", href: "/reports?tab=estimating_feedback" }, { label: "Settings › Surface Rates", href: "/settings/surface-rates" }],
    parts: { minimal: ["Estimating Feedback report", "Rate versions in Surface Rates"], complete: [] }, built: true,
  },
  {
    key: "f33", group: "built", number: 33, name: "Financial and Accounting Management",
    breakdown: "The QuickBooks sync, Sync Log and Needs Attention, bills, checkbook, feeds and finance reports.",
    where: [{ label: "Accounting", href: "/accounting" }, { label: "Settings › Accounting", href: "/settings/accounting" }, { label: "Invoices › QuickBooks", href: "/invoices" }],
    parts: { minimal: ["Accounting module", "Settings › Accounting", "QuickBooks column and card on invoices", "Job Margin, Income & Expense, Aged Receivables"], complete: [] }, built: true,
  },
  {
    key: "f34", group: "built", number: 34, name: "Social Media and Marketing Management",
    breakdown: "Social posts, campaigns, automations and website lead review.",
    where: [{ label: "Marketing", href: "/marketing" }, { label: "Settings › Social Accounts", href: "/settings/social-accounts" }, { label: "Leads › Website", href: "/leads?view=website" }],
    parts: { minimal: ["Marketing module", "Social Accounts settings", "Website lead review"], complete: [] }, built: true,
  },
  {
    key: "qb", group: "sep30", prefix: "QB", name: "QuickBooks integration",
    breakdown: "Choose where the books are kept, match contacts on first connection, and see QuickBooks status on contacts and invoices.",
    where: [{ label: "Settings › Accounting", href: "/settings/accounting" }, { label: "Accounting", href: "/accounting" }, { label: "Invoices", href: "/invoices" }],
    parts: {
      minimal: ["X-M2 Accounting destination", "QB-M2 Sync options", "QB-M3 Match your contacts", "QB-M1, M4–M7 Existing QuickBooks screens (markers)"],
      complete: ["QB-C1 Customer Review", "QB-C2 Updated from QuickBooks note", "QB-C4 QuickBooks card on contacts and invoices", "QB-C3, C5, C6 Existing flags, bills and Job Margin (markers)"],
    }, built: true,
  },
  {
    key: "crm", group: "sep30", prefix: "CRM", name: "CRM lead pipelines",
    breakdown: "Sales and Production boards with your own stages, and leads from tracked links with the source set automatically.",
    where: [{ label: "Lead Pipeline", href: "/leads" }, { label: "Settings › Pipeline Stages", href: "/settings/pipeline-stages" }, { label: "Leads › Website", href: "/leads?view=website" }],
    parts: {
      minimal: ["CRM-M1 Sales / Production boards", "CRM-M2 Pipeline stages", "CRM-M3 Production card on Sold", "CRM-M5 Tracked links", "CRM-M6 Source badge and filter", "CRM-M7 Stage history"],
      complete: ["CRM-C1 Group by source", "CRM-C2 Add pipeline", "CRM-C3 Template triggers and approval", "CRM-C4 Rules editor", "CRM-C5 Flow view", "Waiting for approval queue", "CRM-C6 Facebook Lead Ads", "CRM-C7 Journey bar"],
    }, built: true,
  },
  {
    key: "js", group: "sep30", prefix: "JS", name: "Job scheduling emails",
    breakdown: "No email on every save; one summary email per person, sent when you choose.",
    where: [{ label: "Job Scheduling", href: "/job-scheduling" }, { label: "Settings › Automated Messages", href: "/settings/automated-messages" }],
    parts: {
      minimal: ["JS-M1 Saved, not notified", "JS-M2 Changes not sent", "JS-M3 Unsent changes", "JS-M4 Schedule Update email"],
      complete: ["JS-C1 Send Email on a job", "JS-C2 Notify after Bulk Reschedule", "JS-C3 Automatic / Manual mode", "JS-C4 Delivered / Not delivered", "JS-C5 Email and Text", "JS-C6 English / Español"],
    }, built: true,
  },
  {
    key: "rp", group: "sep30", prefix: "RP", name: "Amended estimates in reports",
    breakdown: "An amendment counts only its difference, in the month it is re-approved.",
    where: [{ label: "Reports › Estimates Log", href: "/reports?tab=estimates" }, { label: "Reports › Jobs Sold", href: "/reports?tab=jobs_sold" }],
    parts: {
      minimal: ["RP-M1/M2 Sales entries", "RP-M3 One row per entry", "RP-M4 New sales / Amendments / Total", "RP-M5 Counts unchanged", "RP-M6 Migration"],
      complete: ["RP-C1 What changed", "RP-C2 Sales by Estimator", "RP-C3 Change orders as entries", "RP-C4 Doesn't add up flag"],
    }, built: true,
  },
  {
    key: "bk", group: "sep30", prefix: "BK", name: "Estimate Master Books",
    breakdown: "Built-in accounting as a mode of Accounting: journal, chart of accounts, reconciliation, Balance Sheet.",
    where: [{ label: "Accounting (Books mode)", href: "/accounting?mode=books" }, { label: "Accounting › Journal", href: "/accounting/journal" }, { label: "Settings › Accounting", href: "/settings/accounting" }],
    parts: {
      minimal: ["BK-M1 Books mode", "BK-M2 Chart of accounts", "BK-M3/M9 Journal", "BK-M5 Reconcile", "BK-M6 Balance Sheet", "BK-M8 Exports", "BK-M10 Payments to deposit", "BK-M11 Write off and payments", "BK-M12/M13 Sales tax, Cash / Accrual"],
      complete: ["BK-C2 Gusto import", "BK-C3 Job profit", "BK-C5 Move from QuickBooks", "BK-C6 1099 and Budget"],
    }, built: true,
  },
];

export const FEATURE_KEYS = FEATURES.map((f) => f.key);

export const featureDef = (key: FeatureKey) => FEATURES.find((f) => f.key === key)!;
