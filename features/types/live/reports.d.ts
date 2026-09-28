/**
 * Additions to the live app's apps/main/src/types/reports.ts and
 * reports/listings/lib/constants.ts REPORT_TABS (features 21, 30, 33).
 *
 * NEW REPORT_TABS entries (value → label):
 *   job_performance     → "Job Performance"       GET /reports/job-performance      (21, next to Jobs To Do)
 *   estimating_feedback → "Estimating Feedback"   GET /reports/estimating-feedback  (30)
 *   job_margin          → "Job Margin"            GET /reports/job-margin           (33, needs client confirmation)
 *   income_expense      → "Income & Expense"      GET /reports/income-expense       (33, needs client confirmation)
 *   aged_receivables    → "Aged Receivables"      GET /reports/aged-receivables     (33, needs client confirmation)
 * All use the live buildParams date filter.
 */

/** NEW (21): one job in Job Performance. Cost values are null for roles that may see hours only. */
interface JobPerformanceItem {
  jobId: string;
  jobNumber: string;
  jobName: string;
  estimator: { id: string; name: string } | null;
  crewLead: { id: string; name: string } | null;
  complete: boolean;
  originalApproved: number | null;
  approvedChange: number | null;
  revisedApproved: number | null;
  actual: number | null;
  variance: number | null;
  variancePercent: number | null;
  /** "Under budget", "Over budget", "On budget". */
  label: string;
  /** Approved hours not yet costed (Rule 3). */
  pendingHours: number;
  reasonCode: string | null;
}

/** NEW (30): one rate record's suggestion in Estimating Feedback. */
interface EstimatingFeedbackItem {
  rateId: string;
  surfaceRateId: string | null;
  kind: 'PRODUCTIVITY' | 'COVERAGE';
  combination: string;
  currentValue: number;
  observedValue: number | null;
  deviationPercent: number | null;
  status: 'SUGGESTED' | 'INSUFFICIENT' | 'SUPPRESSED' | 'APPROVED' | 'DISABLED';
  eligibleJobs: number;
}
