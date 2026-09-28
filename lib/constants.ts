/*
  Shared constants: navigation, status options and badge colors.
  Colors are Tailwind class strings so they can be used directly in className.
*/
import type { EstimateStatus, InvoiceStatus, JobStatus, LeadStatus } from './types';

/* ---------- Main sidebar (order matches the live app) ---------- */

export const MAIN_NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: 'LayoutDashboard' },
  { href: '/leads', label: 'Lead Pipeline', icon: 'Kanban' },
  { href: '/contacts', label: 'Contacts', icon: 'Users' },
  { href: '/calendar', label: 'Calendar', icon: 'Calendar' },
  { href: '/estimates', label: 'Estimates', icon: 'Calculator' },
  { href: '/jobs', label: 'Jobs', icon: 'Briefcase' },
  { href: '/job-scheduling', label: 'Job Scheduling', icon: 'Clock' },
  { href: '/work-orders', label: 'Work Orders', icon: 'ClipboardList' },
  { href: '/invoices', label: 'Invoices', icon: 'Receipt' },
  { href: '/presentations', label: 'Presentation Builder', icon: 'MonitorPlay' },
  { href: '/reports', label: 'Reports', icon: 'BarChart3' },
] as const;

/**
 * NEW standalone modules from the EMTS feature prototype (features/).
 * They have no live host screen, so they get their own sidebar group.
 * `hiddenFor` uses the prototype roles (Prototype bar › Viewing as).
 */
export const NEW_NAV: readonly { href: string; label: string; icon: string; feature: number | number[]; needsConfirmation?: boolean; hiddenFor?: readonly string[] }[] = [
  { href: '/time', label: 'Time', icon: 'Timer', feature: 22 },
  { href: '/supplier-orders', label: 'Supplier Orders', icon: 'PackageSearch', feature: 19, hiddenFor: ['crew_lead', 'bookkeeper'] },
  { href: '/repaint-alerts', label: 'Repaint Alerts', icon: 'BellRing', feature: [27, 29], hiddenFor: ['crew_lead', 'bookkeeper'] },
  { href: '/accounting', label: 'Accounting', icon: 'Landmark', feature: 33, needsConfirmation: true, hiddenFor: ['estimator', 'senior_estimator'] },
  { href: '/marketing', label: 'Marketing', icon: 'Megaphone', feature: 34, needsConfirmation: true, hiddenFor: ['estimator', 'senior_estimator', 'crew_lead', 'bookkeeper'] },
];

export const BOTTOM_NAV = [
  { href: '/support', label: 'Help & Support', icon: 'HelpCircle' },
  { href: '/settings', label: 'Settings', icon: 'Settings' },
] as const;

/* ---------- Settings sidebar (order matches the live app) ---------- */

/** `isNew` pages come from the feature prototype (features/) and carry a NEW badge. */
export const SETTINGS_NAV: readonly {
  section: string;
  items: readonly { id: string; label: string; icon: string; isNew?: boolean; feature?: number | number[] }[];
}[] = [
  {
    section: 'Organization',
    items: [
      { id: 'my-profile', label: 'My Profile', icon: 'User' },
      { id: 'business-profile', label: 'Business Profile', icon: 'Building2' },
      { id: 'team-access', label: 'Team & Access', icon: 'Users' },
      { id: 'subscription', label: 'Subscription & Billing', icon: 'CreditCard' },
      { id: 'payment-gateway', label: 'Payment Gateway', icon: 'Wallet' },
      { id: 'social-accounts', label: 'Social Accounts', icon: 'Share2', isNew: true, feature: 34 },
    ],
  },
  {
    section: 'Configuration',
    items: [
      { id: 'general', label: 'General Configuration', icon: 'Settings2' },
      { id: 'goals-profit', label: 'Goals & Profit', icon: 'TrendingUp' },
      { id: 'financial-settings', label: 'Financial Settings', icon: 'Wallet' },
      { id: 'accounting', label: 'Accounting', icon: 'Landmark', isNew: true, feature: 33 },
      { id: 'labor-config', label: 'Labor Config', icon: 'Users' },
      { id: 'difficulty-tiers', label: 'Difficulty Tiers', icon: 'Signal' },
      { id: 'project-discounts', label: 'Project Discounts', icon: 'Tag' },
      { id: 'tax-regions', label: 'Tax Regions', icon: 'MapPin' },
      { id: 'table-columns', label: 'Table Columns', icon: 'Table' },
      { id: 'pipeline-stages', label: 'Pipeline Stages', icon: 'GitBranch' },
      { id: 'automated-messages', label: 'Automated Messages', icon: 'Mail' },
      { id: 'sms-templates', label: 'SMS Templates', icon: 'MessageSquare' },
      { id: 'document-numbering', label: 'Document Numbering', icon: 'Hash' },
      { id: 'roles-permissions', label: 'Roles & Permissions', icon: 'Shield' },
    ],
  },
  {
    section: 'Libraries',
    items: [
      { id: 'estimate-templates', label: 'Estimate Templates', icon: 'FileText' },
      { id: 'estimate-types', label: 'Estimate Types (Scopes)', icon: 'Layers' },
      { id: 'package-templates', label: 'Package Templates', icon: 'Boxes' },
      { id: 'area-templates', label: 'Area Templates', icon: 'Grid3x3' },
      { id: 'surface-rates', label: 'Surface Rates', icon: 'DollarSign' },
      { id: 'paint-library', label: 'Paint Library', icon: 'Palette' },
      { id: 'brands', label: 'Brands', icon: 'Stamp' },
      { id: 'materials', label: 'Materials & Supplies', icon: 'Package' },
      { id: 'line-items', label: 'Line Items', icon: 'List' },
      { id: 'terms-conditions', label: 'Terms & Conditions', icon: 'FileSignature' },
      { id: 'suppliers', label: 'Suppliers', icon: 'PackageSearch', isNew: true, feature: 19 },
      { id: 'repaint-intervals', label: 'Repaint Intervals', icon: 'BellRing', isNew: true, feature: 27 },
    ],
  },
];

/** Header title for each settings page (used in the top bar). */
export const SETTINGS_TITLES: Record<string, string> = {
  'my-profile': 'My Profile',
  'business-profile': 'Business Profile',
  'team-access': 'Team & Access',
  subscription: 'Subscription & Billing',
  'payment-gateway': 'Payment Gateway',
  general: 'General Configuration',
  'goals-profit': 'Goals & Profit',
  'financial-settings': 'Financial Settings',
  'labor-config': 'Labor Config',
  'difficulty-tiers': 'Difficulty Tiers',
  'project-discounts': 'Project Discounts',
  'tax-regions': 'Tax Regions',
  'table-columns': 'Table Columns',
  'pipeline-stages': 'Pipeline Stages',
  'automated-messages': 'Automated Messages',
  'sms-templates': 'SMS Templates',
  'document-numbering': 'Document Numbering',
  'roles-permissions': 'Roles & Permissions',
  'estimate-templates': 'Estimate Templates',
  'estimate-types': 'Estimate Types',
  'package-templates': 'Package Templates',
  'area-templates': 'Area Templates',
  'surface-rates': 'Surface Rates',
  'paint-library': 'Paint Library',
  brands: 'Brands',
  materials: 'Materials & Supplies',
  'line-items': 'Line Items',
  'terms-conditions': 'Terms & Conditions',
  'social-accounts': 'Social Accounts',
  accounting: 'Accounting',
  suppliers: 'Suppliers',
  'repaint-intervals': 'Repaint Intervals',
};

/* ---------- Leads ---------- */

export const LEAD_STAGES: { status: LeadStatus; label: string; bar: string; count: string }[] = [
  { status: 'New', label: 'New Leads', bar: 'bg-blue-500', count: 'bg-blue-100 text-blue-700' },
  { status: 'Contacted', label: 'Contacted', bar: 'bg-purple-500', count: 'bg-purple-100 text-purple-700' },
  { status: 'Scheduled', label: 'Scheduled', bar: 'bg-orange-500', count: 'bg-orange-100 text-orange-700' },
  { status: 'Pending', label: 'Pending', bar: 'bg-amber-500', count: 'bg-amber-100 text-amber-700' },
  { status: 'Sold', label: 'Sold', bar: 'bg-green-500', count: 'bg-green-100 text-green-700' },
  { status: 'Lost', label: 'Lost', bar: 'bg-red-500', count: 'bg-red-100 text-red-700' },
];

export const LEAD_SOURCES = ['Website', 'Referral', 'Existing Customer', 'Google', 'Facebook', 'Yard Sign', 'HomeAdvisor', 'Other'];
export const SERVICE_TYPES = ['Interior', 'Exterior', 'Cabinets', 'Commercial', 'Other'];

export const CONTACT_TYPE_BADGE: Record<string, string> = {
  LEAD: 'bg-blue-50 text-blue-700 border-blue-200',
  CONTACT: 'bg-purple-50 text-purple-700 border-purple-200',
  CLIENT: 'bg-green-50 text-green-700 border-green-200',
};

/* ---------- Estimates ---------- */

export const ESTIMATE_STATUSES: EstimateStatus[] = ['Draft', 'Sent', 'Viewed', 'Approved', 'Rejected', 'Expired'];

export const ESTIMATE_STATUS_BADGE: Record<EstimateStatus, string> = {
  Draft: 'bg-gray-100 text-gray-700 border-gray-200',
  Sent: 'bg-blue-50 text-blue-700 border-blue-200',
  Viewed: 'bg-sky-50 text-sky-700 border-sky-200',
  Approved: 'bg-green-50 text-green-700 border-green-200',
  Rejected: 'bg-red-50 text-red-700 border-red-200',
  Expired: 'bg-amber-50 text-amber-700 border-amber-200',
};

/* ---------- Jobs ---------- */

export const JOB_STATUSES: JobStatus[] = [
  'Unscheduled', 'Confirmed', 'Scheduled', 'In Production', 'Touch Up', 'Ready for Inspection', 'Completed', 'Marketing', 'Cancelled',
];

export const JOB_STATUS_BADGE: Record<JobStatus, string> = {
  Unscheduled: 'bg-gray-100 text-gray-600 border-gray-200',
  Confirmed: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  Scheduled: 'bg-blue-50 text-blue-700 border-blue-200',
  'In Production': 'bg-purple-50 text-purple-700 border-purple-200',
  'Touch Up': 'bg-amber-50 text-amber-700 border-amber-200',
  'Ready for Inspection': 'bg-orange-50 text-orange-700 border-orange-200',
  Completed: 'bg-green-50 text-green-700 border-green-200',
  Marketing: 'bg-pink-50 text-pink-700 border-pink-200',
  Cancelled: 'bg-red-50 text-red-700 border-red-200',
};

/** Text color used for the small status label on dashboard job rows */
export const JOB_STATUS_TEXT: Record<JobStatus, string> = {
  Unscheduled: 'text-orange-500',
  Confirmed: 'text-cyan-600',
  Scheduled: 'text-blue-600',
  'In Production': 'text-purple-600',
  'Touch Up': 'text-amber-600',
  'Ready for Inspection': 'text-orange-600',
  Completed: 'text-green-600',
  Marketing: 'text-pink-600',
  Cancelled: 'text-red-600',
};

/* ---------- Invoices ---------- */

export const INVOICE_STATUSES: InvoiceStatus[] = ['Draft', 'Sent', 'Unpaid', 'Partial', 'Paid', 'Overdue', 'Void'];

export const INVOICE_STATUS_BADGE: Record<InvoiceStatus, string> = {
  Draft: 'bg-gray-100 text-gray-700 border-gray-200',
  Sent: 'bg-blue-50 text-blue-700 border-blue-200',
  Unpaid: 'bg-amber-50 text-amber-700 border-amber-200',
  Partial: 'bg-purple-50 text-purple-700 border-purple-200',
  Paid: 'bg-green-50 text-green-700 border-green-200',
  Overdue: 'bg-red-50 text-red-700 border-red-200',
  Void: 'bg-gray-50 text-gray-400 border-gray-200 line-through',
};

export const PAYMENT_METHODS = ['Credit Card', 'Check', 'Cash', 'ACH', 'Other'] as const;
