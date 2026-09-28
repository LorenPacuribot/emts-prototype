/*
  Organization settings: my profile, business profile, roles,
  subscription and payment gateway.
  Values follow the live app screenshots (June 2026) where they were visible.
*/
import type { BusinessProfile, PaymentGateway, Role, Subscription, UserProfile } from '../types';

export const userProfile: UserProfile = {
  firstName: 'Kevin',
  lastName: 'Soriano',
  email: 'kevin@estimatemaster.example',
  phone: '',
  jobTitle: 'Owner',
  timezone: 'America/Chicago',
  twoFactorEnabled: false,
  notifications: { email: true, sms: true, push: false },
  darkMode: false,
  password: 'password123',
};

const hours = (open: string, close: string, closed = false) => ({ open, close, closed });

export const businessProfile: BusinessProfile = {
  companyName: 'Technologia',
  legalName: 'Technologia',
  email: 'kevin@estimatemaster.example',
  phone: '3131414345',
  website: 'tech.com',
  street: '1 Tech St.',
  city: 'Powers',
  state: 'TX',
  zip: '24145',
  licenseNumber: 'TX-12342-CS',
  taxId: '82-1234567',
  brandColor: '#2563EB',
  timezone: 'UTC',
  businessHours: [
    { day: 'Monday', ...hours('08:00', '17:00') },
    { day: 'Tuesday', ...hours('08:00', '17:00') },
    { day: 'Wednesday', ...hours('08:00', '17:00') },
    { day: 'Thursday', ...hours('08:00', '17:00') },
    { day: 'Friday', ...hours('08:00', '16:00') },
    { day: 'Saturday', ...hours('09:00', '13:00') },
    { day: 'Sunday', ...hours('00:00', '00:00', true) },
  ],
  emailHeader: 'Technologia',
  emailFooter: 'Best regards,\nTechnologia\n3131414345 | kevin@estimatemaster.example\n1 Tech St., Powers, TX, 24145',
};

/**
 * Permission keys grouped by module. Matches the live app's PERMISSION_CATEGORIES.
 * The Roles screen renders these as a checkbox grid, and the Team member form
 * shows which modules a role can access.
 */
export const PERMISSION_GROUPS: { module: string; keys: { key: string; label: string }[] }[] = [
  { module: 'Leads', keys: [{ key: 'LEAD_VIEW', label: 'View' }, { key: 'LEAD_CREATE', label: 'Create' }, { key: 'LEAD_UPDATE', label: 'Update' }, { key: 'LEAD_DELETE', label: 'Delete' }] },
  {
    module: 'Customers',
    keys: [
      { key: 'CUSTOMER_VIEW', label: 'View' }, { key: 'CUSTOMER_EDIT', label: 'Edit' }, { key: 'CUSTOMER_IMPORT', label: 'Import' },
      { key: 'CUSTOMER_EMAIL_VIEW', label: 'View Emails' }, { key: 'CUSTOMER_EMAIL_SEND', label: 'Send Emails' },
      { key: 'CUSTOMER_SMS_VIEW', label: 'View SMS' }, { key: 'CUSTOMER_SMS_SEND', label: 'Send SMS' },
    ],
  },
  {
    module: 'Estimates',
    keys: [
      { key: 'ESTIMATE_VIEW', label: 'View' }, { key: 'ESTIMATE_CREATE', label: 'Create' }, { key: 'ESTIMATE_EDIT', label: 'Edit' },
      { key: 'ESTIMATE_DELETE', label: 'Delete' }, { key: 'ESTIMATE_SEND', label: 'Send' },
      { key: 'ESTIMATE_VIEW_FINANCIALS', label: 'View Financials' }, { key: 'ESTIMATE_AMEND', label: 'Amend Estimate' },
    ],
  },
  { module: 'Jobs', keys: [{ key: 'JOB_VIEW', label: 'View' }, { key: 'JOB_UPDATE_STATUS', label: 'Update Status' }, { key: 'JOB_VIEW_FINANCIALS', label: 'View Financials' }] },
  {
    module: 'Work Orders',
    keys: [
      { key: 'WORK_ORDER_VIEW', label: 'View' }, { key: 'WORK_ORDER_UPDATE_STATUS', label: 'Update Status' },
      { key: 'WORK_ORDER_MANAGE_CREW', label: 'Manage Crew' }, { key: 'WORK_ORDER_MANAGE_SCHEDULE', label: 'Manage Schedule' },
      { key: 'WORK_ORDER_LOG_TIME', label: 'Log Time' }, { key: 'WORK_ORDER_ADD_NOTES', label: 'Add Notes' },
      { key: 'WORK_ORDER_ADD_ATTACHMENTS', label: 'Add Attachments' },
    ],
  },
  { module: 'Scheduling', keys: [{ key: 'JOB_SCHEDULE_VIEW', label: 'View' }, { key: 'JOB_SCHEDULE_VIEW_ALL', label: 'View All' }, { key: 'JOB_SCHEDULE_MANAGE', label: 'Manage' }] },
  { module: 'Sales Calendar', keys: [{ key: 'SALES_CALENDAR_VIEW', label: 'View' }, { key: 'SALES_CALENDAR_MANAGE', label: 'Manage' }] },
  {
    module: 'Availability',
    keys: [
      { key: 'AVAILABILITY_VIEW_SELF', label: 'View Self' }, { key: 'AVAILABILITY_VIEW_ALL', label: 'View All' },
      { key: 'AVAILABILITY_MANAGE', label: 'Manage' }, { key: 'AVAILABILITY_MANAGE_SELF', label: 'Manage Self' },
    ],
  },
  { module: 'Invoices', keys: [{ key: 'INVOICE_VIEW', label: 'View' }, { key: 'INVOICE_CREATE', label: 'Create' }, { key: 'INVOICE_SEND', label: 'Send' }] },
  {
    module: 'Administration',
    keys: [
      { key: 'ADMIN_BUSINESS_PROFILE', label: 'Business Profile' }, { key: 'ADMIN_CREW_TEAM', label: 'Crew & Team' },
      { key: 'ADMIN_SUBSCRIPTION', label: 'Subscription' }, { key: 'ADMIN_MASTER_DATA', label: 'Master Data' },
    ],
  },
  { module: 'Engine Calibration', keys: [{ key: 'ENGINE_CALIBRATION_VIEW', label: 'View' }, { key: 'ENGINE_CALIBRATION_MANAGE', label: 'Manage' }] },
  {
    module: 'Presentations',
    keys: [{ key: 'PRESENTATION_VIEW', label: 'View' }, { key: 'PRESENTATION_CREATE', label: 'Create' }, { key: 'PRESENTATION_UPDATE', label: 'Update' }, { key: 'PRESENTATION_DELETE', label: 'Delete' }],
  },
  { module: 'Activity Feed', keys: [{ key: 'ACTIVITY_VIEW', label: 'View' }] },
  { module: 'Reports & Users', keys: [{ key: 'REPORT_VIEW', label: 'View Reports' }, { key: 'USER_MANAGE', label: 'Manage Users' }, { key: 'ROLE_MANAGE', label: 'Manage Roles' }] },
];

const ALL = PERMISSION_GROUPS.flatMap((g) => g.keys.map((k) => k.key));
const pick = (prefixes: string[]) => ALL.filter((k) => prefixes.some((p) => k.startsWith(p)));

const ESTIMATOR = [...pick(['LEAD_', 'CUSTOMER_', 'ESTIMATE_', 'PRESENTATION_', 'SALES_CALENDAR_']), 'JOB_VIEW', 'AVAILABILITY_VIEW_SELF', 'AVAILABILITY_MANAGE_SELF', 'ACTIVITY_VIEW'];
const MANAGER = ALL.filter((k) => !k.startsWith('ADMIN_') && k !== 'ROLE_MANAGE' && k !== 'USER_MANAGE');
const CREW_LEAD = ['JOB_VIEW', 'JOB_UPDATE_STATUS', 'WORK_ORDER_VIEW', 'WORK_ORDER_UPDATE_STATUS', 'WORK_ORDER_MANAGE_CREW', 'WORK_ORDER_LOG_TIME', 'WORK_ORDER_ADD_NOTES', 'WORK_ORDER_ADD_ATTACHMENTS', 'JOB_SCHEDULE_VIEW', 'SALES_CALENDAR_VIEW', 'AVAILABILITY_VIEW_SELF', 'AVAILABILITY_MANAGE_SELF'];
const CREW = ['JOB_VIEW', 'WORK_ORDER_VIEW', 'WORK_ORDER_LOG_TIME', 'WORK_ORDER_ADD_NOTES', 'JOB_SCHEDULE_VIEW', 'AVAILABILITY_VIEW_SELF', 'AVAILABILITY_MANAGE_SELF'];
const APPRENTICE = ['JOB_VIEW', 'WORK_ORDER_VIEW', 'WORK_ORDER_ADD_NOTES', 'JOB_SCHEDULE_VIEW', 'SALES_CALENDAR_VIEW', 'AVAILABILITY_VIEW_SELF', 'AVAILABILITY_MANAGE_SELF'];

/** Default permissions per system role. Used by "Reset to default permissions". */
export const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
  role_owner: ALL,
  role_admin: ALL.filter((k) => k !== 'ADMIN_SUBSCRIPTION'),
  role_manager: MANAGER,
  role_estimator: ESTIMATOR,
  role_pm: MANAGER.filter((k) => !k.startsWith('ENGINE_')),
  role_crewlead: CREW_LEAD,
  role_crewmember: CREW,
  role_painter: CREW,
  role_apprentice: APPRENTICE,
  role_crew: CREW,
};

export const roles: Role[] = [
  { id: 'role_owner', name: 'Owner', description: 'Business owner with full access to every module, billing and settings.', roleType: 'SYSTEM', permissions: DEFAULT_ROLE_PERMISSIONS.role_owner!, defaultPermissions: DEFAULT_ROLE_PERMISSIONS.role_owner! },
  { id: 'role_admin', name: 'Admin', description: 'Full access to all modules except subscription billing.', roleType: 'SYSTEM', permissions: DEFAULT_ROLE_PERMISSIONS.role_admin!, defaultPermissions: DEFAULT_ROLE_PERMISSIONS.role_admin! },
  { id: 'role_manager', name: 'Manager', description: 'Manages leads, estimates, jobs and crews. No access to administration.', roleType: 'SYSTEM', permissions: DEFAULT_ROLE_PERMISSIONS.role_manager!, defaultPermissions: DEFAULT_ROLE_PERMISSIONS.role_manager! },
  { id: 'role_estimator', name: 'Estimator', description: 'Creates and sends estimates, manages leads and customers.', roleType: 'SYSTEM', permissions: DEFAULT_ROLE_PERMISSIONS.role_estimator!, defaultPermissions: DEFAULT_ROLE_PERMISSIONS.role_estimator! },
  { id: 'role_pm', name: 'Project Manager', description: 'Schedules jobs, manages work orders and crews.', roleType: 'SYSTEM', permissions: DEFAULT_ROLE_PERMISSIONS.role_pm!, defaultPermissions: DEFAULT_ROLE_PERMISSIONS.role_pm! },
  { id: 'role_crewlead', name: 'Crew Lead', description: 'Leads a crew on site. Updates job status and logs time.', roleType: 'SYSTEM', permissions: DEFAULT_ROLE_PERMISSIONS.role_crewlead!, defaultPermissions: DEFAULT_ROLE_PERMISSIONS.role_crewlead! },
  { id: 'role_crewmember', name: 'Crew Member', description: 'Views assigned work orders and logs time.', roleType: 'SYSTEM', permissions: DEFAULT_ROLE_PERMISSIONS.role_crewmember!, defaultPermissions: DEFAULT_ROLE_PERMISSIONS.role_crewmember! },
  { id: 'role_painter', name: 'Painter', description: 'Field painter with access to assigned work orders.', roleType: 'SYSTEM', permissions: DEFAULT_ROLE_PERMISSIONS.role_painter!, defaultPermissions: DEFAULT_ROLE_PERMISSIONS.role_painter! },
  { id: 'role_apprentice', name: 'Apprentice', description: 'Trainee with view-only access and ability to add notes', roleType: 'SYSTEM', permissions: DEFAULT_ROLE_PERMISSIONS.role_apprentice!, defaultPermissions: DEFAULT_ROLE_PERMISSIONS.role_apprentice! },
  { id: 'role_crew', name: 'Crew', description: 'Custom role: view assigned jobs and work orders only.', roleType: 'CUSTOM', permissions: DEFAULT_ROLE_PERMISSIONS.role_crew! },
];

export const subscription: Subscription = {
  planName: 'Growth',
  price: 129,
  interval: 'month',
  status: 'Active',
  renewsAt: '2026-10-23',
  seatsIncluded: 5,
  seatsUsed: 2,
  paymentMethod: { brand: 'Visa', last4: '1111', expMonth: 12, expYear: 2028 },
  addOns: [
    { id: 'ao_polish', name: 'Presentation Polish', price: 50, active: true },
  ],
  billingHistory: [
    { id: 'bh_11', date: '2026-09-23', invoiceNumber: 'INV-00011', description: 'GROWTH Plan — Monthly renewal', amount: 129, status: 'Paid', type: 'charge' },
    { id: 'bh_10', date: '2026-08-23', invoiceNumber: 'INV-00010', description: 'GROWTH Plan — Monthly renewal', amount: 129, status: 'Paid', type: 'charge' },
    { id: 'bh_9', date: '2026-07-23', invoiceNumber: 'INV-00009', description: 'GROWTH Plan — Monthly renewal', amount: 129, status: 'Paid', type: 'charge' },
    { id: 'bh_8', date: '2026-06-23', invoiceNumber: 'INV-00008', description: 'GROWTH Plan — Monthly renewal', amount: 129, status: 'Paid', type: 'charge' },
    { id: 'bh_7', date: '2026-05-15', invoiceNumber: 'INV-00007', description: 'Product Catalog Setup (MONTHLY)', amount: 299, status: 'Paid', type: 'charge' },
    { id: 'bh_6', date: '2026-05-15', invoiceNumber: 'INV-00006', description: 'Presentation Polish (MONTHLY)', amount: 50, status: 'Paid', type: 'charge' },
    { id: 'bh_5', date: '2026-05-06', invoiceNumber: 'INV-00005', description: 'Upgrade: FOUNDER_MEMBERSHIP → GROWTH (17 days remaining)', amount: 17, status: 'Paid', type: 'charge' },
    { id: 'bh_4', date: '2026-05-06', invoiceNumber: 'INV-00004', description: 'PLATINUM-DONE FOR YOU (MONTHLY)', amount: 50, status: 'Paid', type: 'charge' },
    { id: 'bh_3', date: '2026-05-06', invoiceNumber: 'INV-00003', description: 'Downgrade: GROWTH → FOUNDER_MEMBERSHIP (17 days refund)', amount: 17, status: 'Paid', type: 'refund' },
    { id: 'bh_2', date: '2026-04-29', invoiceNumber: 'INV-00002', description: 'Downgrade: ENTERPRISE → GROWTH (24 days refund)', amount: 136, status: 'Paid', type: 'refund' },
    { id: 'bh_1', date: '2026-04-23', invoiceNumber: 'INV-00001', description: 'INSTANT GROWTH Plan — First Month', amount: 299, status: 'Paid', type: 'charge' },
  ],
};

export const paymentGateway: PaymentGateway = {
  provider: 'Stripe',
  connected: false,
  acceptCards: true,
  acceptAch: false,
  passFeesToCustomer: false,
  apiLoginId: '',
  transactionKey: '',
  publicClientKey: '',
  production: false,
};
