/**
 * Role permissions, taken from the Access Validations sections.
 *
 * Keep every access rule here so screens only ask "can this user do X?".
 */
import type { Role, User } from "@/features/types";

export const ROLE_LABEL: Record<Role, string> = {
  owner: "Business Owner",
  office_manager: "Office Manager",
  senior_estimator: "Senior Estimator",
  estimator: "Estimator",
  crew_lead: "Crew Lead",
  bookkeeper: "Bookkeeper",
};

const OWNER_OFFICE: Role[] = ["owner", "office_manager"];
const ESTIMATORS: Role[] = ["owner", "office_manager", "senior_estimator", "estimator"];

export const PERMISSIONS = {
  // Existing live permissions used by the rebuilt host screens. The live
  // Permission constant is in the comment (apps/main/src/lib/permissions.ts).
  "lead.create": ESTIMATORS, // LEAD_CREATE
  "lead.update": ESTIMATORS, // LEAD_UPDATE
  "calendar.manage": ESTIMATORS, // SALES_CALENDAR_MANAGE
  "customer.edit": ESTIMATORS, // CUSTOMER_EDIT
  "estimate.create": ESTIMATORS, // ESTIMATE_CREATE
  "estimate.edit": ESTIMATORS, // ESTIMATE_EDIT
  "estimate.send": ESTIMATORS, // ESTIMATE_SEND
  "estimate.amend": ESTIMATORS, // ESTIMATE_AMEND
  "estimate.delete": OWNER_OFFICE, // ESTIMATE_DELETE
  "estimate.viewFinancials": [...OWNER_OFFICE, "senior_estimator"], // ESTIMATE_VIEW_FINANCIALS
  "job.updateStatus": [...OWNER_OFFICE, "crew_lead"], // JOB_UPDATE_STATUS
  "job.viewFinancials": [...OWNER_OFFICE, "bookkeeper"], // JOB_VIEW_FINANCIALS
  "workOrder.updateStatus": [...OWNER_OFFICE, "crew_lead"], // WORK_ORDER_UPDATE_STATUS
  "workOrder.manageSchedule": OWNER_OFFICE, // WORK_ORDER_MANAGE_SCHEDULE
  "workOrder.manageCrew": [...OWNER_OFFICE, "crew_lead"], // WORK_ORDER_MANAGE_CREW
  "workOrder.logTime": [...OWNER_OFFICE, "crew_lead"], // WORK_ORDER_LOG_TIME
  "workOrder.addNotes": [...ESTIMATORS, "crew_lead"], // WORK_ORDER_ADD_NOTES
  "workOrder.addAttachments": [...ESTIMATORS, "crew_lead"], // WORK_ORDER_ADD_ATTACHMENTS
  "invoice.send": [...OWNER_OFFICE, "bookkeeper"], // INVOICE_SEND
  "payment.process": [...OWNER_OFFICE, "bookkeeper"], // PAYMENT_PROCESS
  "settings.masterData": OWNER_OFFICE, // ADMIN_MASTER_DATA
  "settings.engineCalibration": ["owner", "office_manager", "senior_estimator"], // ENGINE_CALIBRATION_VIEW
  "report.view": ["owner", "office_manager", "senior_estimator", "estimator", "crew_lead", "bookkeeper"], // REPORT_VIEW
  // Feature 3
  "colourCard.edit": ESTIMATORS,
  "colourCard.editCompleted": OWNER_OFFICE,
  "colourCard.overrideCompatibility": ["owner", "senior_estimator"],
  "colourCard.lockLifespan": ["owner"],
  "catalog.edit": OWNER_OFFICE,
  // Feature 18
  "materials.approveDemand": ESTIMATORS,
  "materials.approveAdjustment": OWNER_OFFICE,
  "materials.seePrices": OWNER_OFFICE,
  "materials.confirmShelf": [...OWNER_OFFICE, "senior_estimator", "estimator", "crew_lead"],
  "po.generate": OWNER_OFFICE,
  "po.ownerApprove": ["owner"],
  "po.receive": [...OWNER_OFFICE, "crew_lead"],
  "po.approveOverReceipt": ["office_manager", "owner"],
  // Feature 19
  "supplier.submit": OWNER_OFFICE,
  "supplier.setup": ["office_manager", "owner"],
  "supplier.seeAccount": OWNER_OFFICE,
  // Feature 24
  "co.build": ESTIMATORS,
  "co.ownerApprove": ["owner"],
  "co.send": OWNER_OFFICE,
  "co.exceptions": OWNER_OFFICE,
  "co.seePrices": [...ESTIMATORS, "bookkeeper"],
  "co.seeCost": ESTIMATORS,
  "co.authoriseEmergency": OWNER_OFFICE,
  "co.recordDecision": OWNER_OFFICE,
  // Feature 25
  "property.closeJob": ["office_manager", "owner"],
  "property.confirmApplications": ["crew_lead", "office_manager", "owner"],
  "property.correct": OWNER_OFFICE,
  "property.approveUnknown": ["owner"],
  "property.seeCosts": [...OWNER_OFFICE, "bookkeeper"],
  "property.editStructure": OWNER_OFFICE,
  "property.approveStructure": ["owner"],
  "property.ownershipChange": OWNER_OFFICE,
  "property.recordConsent": ["office_manager", "owner"],
  "property.approveUnreachable": ["owner"],
  "property.deletePersonalData": OWNER_OFFICE,
  "property.logReportedWork": ESTIMATORS,
  // Feature 26
  "qr.generate": [...OWNER_OFFICE, "senior_estimator", "estimator"],
  "qr.revoke": OWNER_OFFICE,
  "qr.verifyContact": OWNER_OFFICE,
  "qr.selectPhotos": OWNER_OFFICE,
  "qr.approvePhoto": ["owner"],
  "qr.touchUps": ESTIMATORS,
  // Feature 27
  "alerts.queue": OWNER_OFFICE,
  "alerts.editLibrary": ["owner"],
  "alerts.recalculate": ["owner"],
  "alerts.approveExtension": ["owner"],
  "alerts.proposeExtension": ["owner", "office_manager", "senior_estimator", "estimator"],
  // Feature 28
  "repeat.build": ESTIMATORS,
  "repeat.approveProductivity": ["owner"],
  "reorder.approve": OWNER_OFFICE,
  "repeat.approveReplacementOffice": OWNER_OFFICE,
  "repeat.approveReplacementOwner": ["owner"],
  // Feature 29
  "followup.qualify": OWNER_OFFICE,
  "followup.work": ESTIMATORS,
  "followup.reconsent": OWNER_OFFICE,
  "followup.seeDollars": ["owner", "office_manager", "bookkeeper"],
  // Feature 22
  "time.clock": ["crew_lead", "office_manager", "owner"],
  "time.submit": ["crew_lead", "office_manager", "owner"],
  /** Who may open the approval screen. Who may approve a given entry is decided by approverFor(). */
  "time.approve": ["office_manager", "owner", "bookkeeper"],
  "time.viewCrew": ["crew_lead", "office_manager", "owner", "bookkeeper"],
  /** Payroll detail: regular / overtime classification, batches, the Gusto file. */
  "time.payrollDetail": OWNER_OFFICE,
  /** The crew lead chooses between conflicting punches. The system never chooses. */
  "time.resolveConflict": ["crew_lead"],
  "time.decideNoLunch": OWNER_OFFICE,
  "time.override": OWNER_OFFICE,
  "payroll.batch": OWNER_OFFICE,
  "payroll.results": ["office_manager", "bookkeeper", "owner"],
  "payroll.adjust": OWNER_OFFICE,
  "payroll.gps": OWNER_OFFICE,
  /** Rule 3: the bookkeeper enters labour cost totals. Only bookkeeper and owner see per-employee totals. */
  "labour.enter": ["bookkeeper"],
  "labour.seeEmployeeTotals": ["bookkeeper", "owner"],
  "labour.reconcile": ["office_manager"],
  "labour.setBurden": ["owner"],
  "mileage.approve": ["crew_lead"],
  "mileage.review": OWNER_OFFICE,
  "mileage.rate": ["bookkeeper"],
  // Feature 33. Estimators have no ledger or company-finance access.
  "finance.access": ["owner", "office_manager", "bookkeeper"],
  /**
   * 2 Oct 2026 (D3): QuickBooks Connect / Disconnect, sync options and
   * confirming contact matches are for Owner and Admin (the office manager in
   * the prototype), and only with the QuickBooks add-on on the plan.
   */
  "finance.connect": OWNER_OFFICE, // PAYMENT_CONFIG
  "finance.code": ["owner", "office_manager", "bookkeeper"],
  "finance.exchange": ["owner", "office_manager", "bookkeeper"],
  "finance.reviewVariance": ["office_manager"],
  "finance.recordPayment": ["office_manager", "bookkeeper"],
  "finance.approvePayment": ["owner"],
  "finance.config": ["bookkeeper"],
  "finance.approveCostCode": ["owner"],
  "finance.requestVendor": ["office_manager"],
  "finance.activateVendor": ["owner"],
  "finance.auditExport": ["bookkeeper", "owner"],
  "finance.migration": ["bookkeeper"],
  "finance.reports": ["owner", "office_manager", "bookkeeper"],
  "reimburse.submit": ["owner", "office_manager", "senior_estimator", "estimator", "crew_lead", "bookkeeper"],
  "reimburse.crewApprove": ["crew_lead"],
  "reimburse.officeReview": ["office_manager"],
  "reimburse.ownerApprove": ["owner"],
  // Feature 21. Every role opens Job Performance; estimators see their own jobs, crew leads hours only.
  "perf.issue": OWNER_OFFICE,
  "perf.reason": ESTIMATORS,
  "perf.approveCorrection": OWNER_OFFICE,
  /** Per-employee hours in the drill-down. Per-employee cost follows Rule 3 (labour.seeEmployeeTotals). */
  "perf.wageDetail": OWNER_OFFICE,
  // Feature 30. The estimating manager is the senior estimator. Approval stays with the owner alone.
  "feedback.view": ESTIMATORS,
  "feedback.exclude": ["owner", "senior_estimator"],
  "feedback.reopen": ["senior_estimator"],
  "feedback.review": ["senior_estimator"],
  "feedback.approve": ["owner"],
  // Feature 34. The office drafts and posts; the owner approves identifiable content and controls the accounts.
  "marketing.access": OWNER_OFFICE,
  "marketing.post": OWNER_OFFICE,
  "marketing.approve": ["owner"],
  "marketing.accounts": ["owner"],
} satisfies Record<string, Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(user: User | undefined, permission: Permission): boolean {
  if (!user) return false;
  return (PERMISSIONS[permission] as Role[]).includes(user.role);
}

/** Human-readable list of roles allowed, for "requires ..." messages. */
export function whoCan(permission: Permission): string {
  return (PERMISSIONS[permission] as Role[]).map((r) => ROLE_LABEL[r]).join(" or ");
}
