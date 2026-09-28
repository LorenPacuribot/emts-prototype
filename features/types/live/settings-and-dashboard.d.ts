/**
 * Additions to the live app's types for the settings pages, the dashboard
 * and invoices (features 19, 22, 24, 27, 30, 33). Ambient types, like the
 * live apps/main/src/types folder. Existing interfaces list NEW fields only.
 *
 * NEW settings pages, each registered in the four live places:
 *   /settings/suppliers          SETTINGS_PERMISSIONS: SUPPLIER_SETUP          (19)
 *   /settings/repaint-intervals  SETTINGS_PERMISSIONS: REPAINT_LIBRARY_VIEW    (27)
 *   /settings/accounting         SETTINGS_PERMISSIONS: ACCOUNTING_CONFIG       (33, needs client confirmation)
 * NEW standalone routes (no live host): /supplier-orders (19), /repaint-alerts (27), /accounting (33), /time (22).
 * NEW dashboard widgets: GET /dashboard/widgets/repaint-alerts, /change-order-exceptions,
 *   /supplier-order-exceptions, /time-to-approve.
 */

/* ------------------------------ types/dashboard.ts ------------------------------ */

/** Live DashboardWidgetId, plus the NEW widgets. */
type DashboardWidgetIdNew = 'repaint-alerts' | 'change-order-exceptions' | 'supplier-order-exceptions' | 'time-to-approve';

/* ------------------------------ types/suppliers.ts (NEW, 19) ------------------------------ */

interface Supplier {
  id: string;
  name: string;
  launchPhase: string;
}

interface SupplierBranch {
  id: string;
  supplierId: string;
  name: string;
  /** Required before a branch can receive orders. */
  storeNumber: string;
  /** Hidden for roles without SUPPLIER_ACCOUNT_VIEW. */
  accountNumber: string | null;
  phone: string;
  email: string | null;
}

interface SupplierProductMapping {
  id: string;
  paintProductId: string;
  supplierId: string;
  containerSizeId: string;
  /** The supplier's item code (SKU). */
  itemCode: string;
  branchId: string | null;
}

/* ------------------------------ types/repaint.ts (NEW, 27) ------------------------------ */

interface RepaintIntervalDefault {
  roomType: string;
  years: number;
}

interface RepaintIntervalLibrary {
  version: number;
  defaults: RepaintIntervalDefault[];
  /** Adjustments applied in order: tier, prep quality, exposure. */
  adjustments: { key: string; years: number }[];
  effectiveFrom: string;
  approvedBy: { id: string; name: string };
}

type RepaintAlertOutcome = 'OPEN' | 'CONTACTED' | 'SNOOZED' | 'DISMISSED' | 'CONVERTED';

interface RepaintAlertResponse {
  id: string;
  serviceLocationId: string;
  customerId: string;
  surfaces: { estimateSurfaceId: string; name: string; dueDate: string; lastPaintedAt: string }[];
  dueDate: string;
  outcome: RepaintAlertOutcome;
  snoozedUntil: string | null;
  /** Suppressed while an open estimate, opt-out or recent contact exists. */
  suppressedReason: string | null;
  escalatedAt: string | null;
  /** Set when qualified: the lead created in the pipeline (29). */
  leadId: string | null;
}

/* ------------------------------ types/surface-rates.ts (30) ------------------------------ */

/** Live SurfaceRateResponse — NEW fields only. */
interface SurfaceRateResponse {
  /** NEW: a rate is never overwritten; each approved change is a version. */
  version: number;
  versions: { version: number; rateCoat1: number; previous: number | null; kind: 'INITIAL' | 'APPROVAL' | 'ROLLBACK'; by: { id: string; name: string }; at: string; reason: string }[];
  /** NEW: the current feedback suggestion for this rate. */
  suggestion: { status: 'SUGGESTED' | 'INSUFFICIENT' | 'SUPPRESSED' | 'APPROVED' | 'DISABLED'; observedRate: number | null; eligibleJobs: number } | null;
}

/* ------------------------------ types/invoices.ts (24, 33) ------------------------------ */

/** Live InvoiceType, plus the NEW change-order types (24) and the touch-up sale (28). */
type InvoiceTypeNew = 'DEPOSIT' | 'PROGRESS' | 'FINAL' | 'SUPPLEMENTAL' | 'CREDIT_NOTE' | 'TOUCH_UP';

/** Live InvoiceDetailDto — NEW fields only (33). */
interface InvoiceDetailDto {
  /** NEW: the invoice's QuickBooks exchange state. */
  quickbooks: { state: 'NOT_SENT' | 'QUEUED' | 'SENT' | 'ACCEPTED' | 'REJECTED' | 'DELETED_IN_QBO'; externalRef: string | null; lastAttemptAt: string | null; varianceFlag: boolean } | null;
  /** NEW (24): the change order a supplemental invoice or credit note bills. */
  changeOrderId: string | null;
}

/* ------------------------------ types/financial-settings.ts (33) ------------------------------ */

/** NEW: QuickBooks Online connection (Settings › Accounting, Payment Gateway pattern). */
interface QuickBooksConnectionResponse {
  connected: boolean;
  realmId: string | null;
  connectedBy: { id: string; name: string } | null;
  connectedAt: string | null;
  lastExchangeAt: string | null;
}
