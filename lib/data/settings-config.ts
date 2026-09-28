/*
  Configuration settings: pricing defaults, goals, labor, tiers, discounts,
  tax, table columns, pipeline stages, messages, numbering.
  Values match the live app screenshots where they were visible.
*/
import type {
  AutomatedMessage, DifficultyTier, DocumentNumbering, FinancialSettings, GeneralConfig,
  GoalsProfit, LaborConfig, PipelineStage, ProjectDiscount, SmsTemplate, TableColumn, TaxRegion,
} from '../types';

export const generalConfig: GeneralConfig = {
  baseLaborRate: 70.3125,
  laborMargin: 20,
  operatingExpense: 1,
  calculateWaste: false,
  defaultWastePercent: 10,
};

export const goalsProfit: GoalsProfit = {
  desiredAnnualIncome: 100000,
  annualRevenueTarget: 285714.29,
  monthlyRevenueTarget: 25000,
  profitMargin: 35,
  miscExpense: 8,
  includeMiscExpense: true,
  workingWeeksPerYear: 48,
  hoursPerWeek: 40,
  crewSize: 3,
  avgJobSize: 3500,
  closingRate: 35,
  leadConversionRate: 25,
  materialCost: 13,
  avgHourlyPay: 25,
  burden: { socialSecurity: 7.65, medicareFuta: 0.1, stateUnemp: 5, workmansComp: 10, otherLiability: 1, benefits: 0 },
};

export const financialSettings: FinancialSettings = {
  applyProfitToMiscLineItems: true,
  miscLineItemProfitMargin: 20,
  depositPercent: 30,
  paymentTermsDays: 15,
  currency: 'USD',
  lateFeePercent: 1.5,
};

export const laborConfig: LaborConfig = {
  baseHourlyRate: 56,
  socialSecurity: 7.65,
  medicareFuta: 0.1,
  stateUnemp: 5,
  workmansComp: 10,
  otherLiability: 1,
  benefits: 0,
  customBurdens: [],
};

export const difficultyTiers: DifficultyTier[] = [
  { id: 'dt_std', name: 'Standard (8-9ft)', tierType: 'HEIGHT', multiplier: 1, sortOrder: 1 },
  { id: 'dt_high', name: 'High (10-12ft)', tierType: 'HEIGHT', multiplier: 1.2, sortOrder: 2 },
  { id: 'dt_vault', name: 'Vaulted / 2-Story', tierType: 'HEIGHT', multiplier: 1.5, sortOrder: 3 },
  { id: 'dt_empty', name: 'Empty / Easy', tierType: 'ACCESS', multiplier: 1, sortOrder: 1 },
  { id: 'dt_furn', name: 'Furnished / Standard', tierType: 'ACCESS', multiplier: 1.1, sortOrder: 2 },
  { id: 'dt_occ', name: 'Occupied / Heavy Furniture', tierType: 'ACCESS', multiplier: 1.25, sortOrder: 3 },
];

export const projectDiscounts: ProjectDiscount[] = [
  { id: 'pd_repeat', name: 'Repeat Customer', discountType: 'PERCENT', value: 10, sortOrder: 1 },
  { id: 'pd_large', name: 'Large Project', discountType: 'PERCENT', value: 5, sortOrder: 2 },
  { id: 'pd_referral', name: 'Referral Discount', discountType: 'FLAT_PRICE', value: 100, sortOrder: 3 },
];

export const taxRegions: TaxRegion[] = [
  { id: 'tx_austin', name: 'Austin, TX', salesTaxRate: 8.25, serviceTaxRate: 0, zipCodes: ['78701', '78702', '78704'], isDefault: true },
  { id: 'tx_dallas', name: 'Dallas, TX', salesTaxRate: 8.25, serviceTaxRate: 0, zipCodes: ['75201', '75204'] },
  { id: 'tx_nashville', name: 'Nashville, TN', salesTaxRate: 9.25, serviceTaxRate: 0, zipCodes: ['37201', '37203'] },
  { id: 'tx_none', name: 'Tax Exempt', salesTaxRate: 0, serviceTaxRate: 0, zipCodes: [] },
];

export const tableColumns: TableColumn[] = [
  { id: 'tcol_surface', name: 'Item', columnType: 'SYSTEM', isVisible: true, isSystem: true, sortOrder: 1 },
  { id: 'tcol_qty', name: 'Amount', columnType: 'SYSTEM', isVisible: true, isSystem: true, sortOrder: 2 },
  { id: 'tcol_coats', name: 'Coats', columnType: 'SYSTEM', isVisible: true, isSystem: true, sortOrder: 3 },
  { id: 'tcol_paint', name: 'Color', columnType: 'SYSTEM', isVisible: true, isSystem: true, sortOrder: 4 },
  { id: 'tcol_hours', name: 'Hours', columnType: 'SYSTEM', isVisible: true, isSystem: true, sortOrder: 5 },
  { id: 'tcol_gal', name: 'Est. Gal', columnType: 'SYSTEM', isVisible: true, isSystem: true, sortOrder: 6 },
  { id: 'tcol_psurface', name: 'Paint Surface', columnType: 'SYSTEM', isVisible: true, isSystem: true, sortOrder: 7 },
  { id: 'tcol_prep', name: 'Prep (Hrs)', columnType: 'HOURS', unit: 'hr', isVisible: true, isSystem: false, sortOrder: 8 },
  { id: 'tcol_doors', name: 'Patching', columnType: 'CHECKBOX', isVisible: true, isSystem: false, sortOrder: 9 },
  { id: 'tcol_wash', name: 'Wash', columnType: 'CHECKBOX', isVisible: false, isSystem: false, sortOrder: 10 },
  { id: 'tcol_prime', name: 'Prime', columnType: 'CHECKBOX', isVisible: false, isSystem: false, sortOrder: 11 },
  { id: 'tcol_caulk', name: 'Caulk', columnType: 'CHECKBOX', isVisible: false, isSystem: false, sortOrder: 12 },
  { id: 'tcol_mask', name: 'Masking', columnType: 'CHECKBOX', isVisible: false, isSystem: false, sortOrder: 13 },
];

export const pipelineStages: PipelineStage[] = [
  { id: 'ps_new', stageId: 'NEW', displayName: 'New Lead', color: '#3B82F6', sortOrder: 1 },
  { id: 'ps_contacted', stageId: 'CONTACTED', displayName: 'Contacted', color: '#A855F7', sortOrder: 2 },
  { id: 'ps_scheduled', stageId: 'SCHEDULED', displayName: 'Estimate Scheduled', color: '#14B8A6', sortOrder: 3 },
  { id: 'ps_pending', stageId: 'PENDING', displayName: 'Pending', color: '#F59E0B', sortOrder: 4 },
  { id: 'ps_sold', stageId: 'SOLD', displayName: 'Sold', color: '#22C55E', sortOrder: 5 },
  { id: 'ps_lost', stageId: 'LOST', displayName: 'Lost', color: '#EF4444', sortOrder: 6 },
  { id: 'ps_archived', stageId: 'ARCHIVED', displayName: 'Archived', color: '#6B7280', sortOrder: 7 },
];

const INV_VARS = ['customerName', 'invoiceNumber', 'estimateName', 'orgName'];
const EST_VARS = ['customerName', 'projectName', 'estimateLink', 'orgName'];
const APPT_VARS = ['customerName', 'appointmentDate', 'appointmentTime', 'estimatorName', 'orgName'];
const USER_VARS = ['firstName', 'resetLink', 'orgName'];

/** Email templates. Names and subjects match the live Automated Messages screen. */
export const automatedMessages: AutomatedMessage[] = [
  { id: 'am_invoice', name: 'Invoice Send', trigger: 'Invoice Sent', channel: 'EMAIL', delayValue: 0, delayUnit: 'minutes', subject: 'Invoice {{invoiceNumber}} from {{orgName}}', body: 'Hi {{customerName}},\n\nPlease find attached invoice {{invoiceNumber}}.', isActive: true, availableVariables: INV_VARS },
  { id: 'am_estsent', name: 'Estimate Send', trigger: 'Estimate Sent', channel: 'EMAIL', delayValue: 0, delayUnit: 'minutes', subject: 'Estimate for {{projectName}}', body: 'Hi {{customerName}},\n\nYour estimate for "{{projectName}}" is ready for review. You can view it here: {{estimateLink}}', isActive: true, availableVariables: EST_VARS },
  { id: 'am_accept', name: 'Project Acceptance', trigger: 'Estimate Accepted', channel: 'EMAIL', delayValue: 0, delayUnit: 'minutes', subject: 'Thank you for choosing {{orgName}}', body: 'Hi {{customerName}},\n\nThank you for accepting the estimate for "{{projectName}}". We will be in touch soon to schedule your project.', isActive: true, availableVariables: EST_VARS },
  { id: 'am_estfollow', name: 'General Follow Up', trigger: 'Estimate Not Viewed', channel: 'EMAIL', delayValue: 3, delayUnit: 'days', subject: 'Regarding your project', body: 'Hi {{customerName}},\n\nJust checking in on your project "{{projectName}}". Reply to this email with any questions.', isActive: true, availableVariables: EST_VARS },
  { id: 'am_apptremind', name: 'Estimate Day Reminder', trigger: 'Estimate Appointment', channel: 'EMAIL', delayValue: 24, delayUnit: 'hours', subject: 'See you soon: Estimate Appointment', body: 'Hi {{customerName}},\n\nThis is a reminder that {{estimatorName}} will visit on {{appointmentDate}} at {{appointmentTime}}.', isActive: true, availableVariables: APPT_VARS },
  { id: 'am_forgot', name: 'Forgot Password', trigger: 'Password Reset Requested', channel: 'EMAIL', delayValue: 0, delayUnit: 'minutes', subject: 'Password Reset Request', body: 'Hi {{firstName}},\n\nWe received a request to reset your password. Use this link to choose a new one: {{resetLink}}', isActive: true, availableVariables: USER_VARS },
  { id: 'am_reset', name: 'Reset Password', trigger: 'Password Reset', channel: 'EMAIL', delayValue: 0, delayUnit: 'minutes', subject: 'Your Password Has Been Reset', body: 'Hi {{firstName}},\n\nYour password has been reset. If you did not do this, contact {{orgName}} right away.', isActive: true, availableVariables: USER_VARS },
  { id: 'am_changed', name: 'Password Changed', trigger: 'Password Changed', channel: 'EMAIL', delayValue: 0, delayUnit: 'minutes', subject: 'Password Successfully Changed', body: 'Hi {{firstName}},\n\nYour password was changed successfully.', isActive: true, availableVariables: USER_VARS },
  { id: 'am_newlead', name: 'Estimate Scheduled', trigger: 'Estimate Scheduled', channel: 'EMAIL', delayValue: 0, delayUnit: 'minutes', subject: 'Your Estimate Appointment is Confirmed', body: 'Hi {{customerName}},\n\nYour estimate appointment is confirmed for {{appointmentDate}} at {{appointmentTime}}.', isActive: true, availableVariables: APPT_VARS },
  { id: 'am_jobsched', name: 'Job Scheduled', trigger: 'Job Scheduled', channel: 'EMAIL', delayValue: 0, delayUnit: 'minutes', subject: 'Your project is scheduled', body: 'Hi {{customerName}},\n\nYour project "{{projectName}}" has been scheduled. We look forward to working with you.', isActive: true, availableVariables: EST_VARS },
  { id: 'am_review', name: 'Estimate Amended', trigger: 'Estimate Amended', channel: 'EMAIL', delayValue: 0, delayUnit: 'minutes', subject: 'Your estimate for {{projectName}} was updated', body: 'Hi {{customerName}},\n\nWe updated your estimate for "{{projectName}}". View the latest version here: {{estimateLink}}', isActive: true, availableVariables: EST_VARS },
];

const SMS_EST = ['clientName', 'projectName', 'estimateLink', 'orgName'];
const SMS_INV = ['customerName', 'invoiceNumber', 'invoiceLink', 'orgName'];
const SMS_APPT = ['clientName', 'appointmentDate', 'appointmentTime', 'orgName'];

/** Default bodies, used by "Reset to default" on the SMS Templates screen. */
export const SMS_DEFAULT_BODIES: Record<string, string> = {
  ESTIMATE_SENT: 'Hi {{clientName}}, your estimate for "{{projectName}}" is ready for review. View it here: {{estimateLink}} - {{orgName}}',
  INVOICE_SENT: 'Hi {{customerName}}, invoice {{invoiceNumber}} from {{orgName}} is ready. Pay online: {{invoiceLink}}',
  PROJECT_ACCEPTED: 'Hi {{clientName}}, thank you for choosing {{orgName}}! We will reach out soon to schedule "{{projectName}}".',
  APPOINTMENT_REMINDER: 'Hi {{clientName}}, reminder: your estimate appointment with {{orgName}} is on {{appointmentDate}} at {{appointmentTime}}.',
  ESTIMATE_SCHEDULED: 'Hi {{clientName}}, your estimate appointment is confirmed for {{appointmentDate}} at {{appointmentTime}}. - {{orgName}}',
  ESTIMATE_AMENDED: 'Hi {{clientName}}, your estimate for "{{projectName}}" was updated. View it here: {{estimateLink}} - {{orgName}}',
};

export const smsTemplates: SmsTemplate[] = [
  { id: 'sms_estimate', type: 'ESTIMATE_SENT', name: 'Estimate Sent', body: SMS_DEFAULT_BODIES.ESTIMATE_SENT!, defaultBody: SMS_DEFAULT_BODIES.ESTIMATE_SENT!, availableVariables: SMS_EST, isDefault: true },
  { id: 'sms_payment', type: 'INVOICE_SENT', name: 'Invoice Sent', body: SMS_DEFAULT_BODIES.INVOICE_SENT!, defaultBody: SMS_DEFAULT_BODIES.INVOICE_SENT!, availableVariables: SMS_INV, isDefault: true },
  { id: 'sms_thanks', type: 'PROJECT_ACCEPTED', name: 'Project Accepted', body: SMS_DEFAULT_BODIES.PROJECT_ACCEPTED!, defaultBody: SMS_DEFAULT_BODIES.PROJECT_ACCEPTED!, availableVariables: SMS_EST, isDefault: true },
  { id: 'sms_remind', type: 'APPOINTMENT_REMINDER', name: 'Estimate Day Reminder', body: SMS_DEFAULT_BODIES.APPOINTMENT_REMINDER!, defaultBody: SMS_DEFAULT_BODIES.APPOINTMENT_REMINDER!, availableVariables: SMS_APPT, isDefault: true },
  { id: 'sms_onway', type: 'ESTIMATE_SCHEDULED', name: 'Estimate Scheduled', body: SMS_DEFAULT_BODIES.ESTIMATE_SCHEDULED!, defaultBody: SMS_DEFAULT_BODIES.ESTIMATE_SCHEDULED!, availableVariables: SMS_APPT, isDefault: true },
  { id: 'sms_complete', type: 'ESTIMATE_AMENDED', name: 'Estimate Amended', body: SMS_DEFAULT_BODIES.ESTIMATE_AMENDED!, defaultBody: SMS_DEFAULT_BODIES.ESTIMATE_AMENDED!, availableVariables: SMS_EST, isDefault: true },
];

export const documentNumbering: DocumentNumbering[] = [
  { id: 'dn_lead', entityType: 'LEAD', formatType: 'PREFIX_YEAR_SERIAL', prefix: 'LEAD', paddingLength: 1, nextSerial: 16 },
  { id: 'dn_est', entityType: 'ESTIMATE', formatType: 'PREFIX_YEAR_SERIAL', prefix: 'EST', paddingLength: 1, nextSerial: 16 },
  { id: 'dn_job', entityType: 'JOB', formatType: 'PREFIX_YEAR_SERIAL', prefix: 'JOB', paddingLength: 1, nextSerial: 9 },
  { id: 'dn_wo', entityType: 'WORK_ORDER', formatType: 'PREFIX_YEAR_SERIAL', prefix: 'WO', paddingLength: 1, nextSerial: 5 },
  { id: 'dn_inv', entityType: 'INVOICE', formatType: 'PREFIX_YEAR_SERIAL', prefix: 'INV', paddingLength: 1, nextSerial: 9 },
];
