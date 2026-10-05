/*
  Customer messages (spec 6.11). One library: email messages are the
  replica's Settings › Automated Messages, texts are Settings › SMS
  Templates. A message made in Automations shows on those pages too, and
  the reverse. Account messages (password emails) and staff messages are
  system messages: they are not listed here and can't be used.

  Also here: the message guide, the sample messages, variable filling,
  unknown-variable checks and the text-part counter. Pure.
*/
import type { AutomatedMessage, SmsTemplate } from '@/lib/types';
import type { CustomerMessage, MessageCategory, MessageVersion } from './types';
import { ALL_VARIABLES } from './registry';

/** Account and staff messages: never shown in Automations, never sent by one. */
export const SYSTEM_MESSAGE_IDS = ['am_forgot', 'am_reset', 'am_changed', 'am_crew_schedule'];

export const isCustomerEmail = (m: AutomatedMessage) => !SYSTEM_MESSAGE_IDS.includes(m.id) && m.channel !== 'SMS';

/** The library as CustomerMessage records, newest version numbers from the history. */
export function libraryFrom(
  emails: AutomatedMessage[],
  texts: SmsTemplate[],
  versions: Record<string, MessageVersion[]>,
  usedIn: (id: string) => string[],
): CustomerMessage[] {
  const meta = (id: string) => {
    const v = versions[id];
    const last = v?.[v.length - 1];
    return { version: last?.version ?? 1, updatedBy: last?.savedBy ?? 'Estimate Master', updatedAt: last?.savedAt ?? '' };
  };
  return [
    ...emails.filter(isCustomerEmail).map((m): CustomerMessage => ({
      id: m.id, name: m.name, channel: 'EMAIL', subject: m.subject ?? '', body: m.body, isSample: false, usedInAutomationIds: usedIn(m.id),
      category: (m.automationCategory as MessageCategory | undefined) ?? 'OTHER', ...meta(m.id),
    })),
    ...texts.map((t): CustomerMessage => ({
      id: t.id, name: t.name, channel: 'SMS', body: t.body, isSample: false, usedInAutomationIds: usedIn(t.id),
      category: (t.automationCategory as MessageCategory | undefined) ?? 'OTHER', ...meta(t.id),
    })),
  ];
}

/* ---------- Variables ---------- */

const VAR_RE = /\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g;

export function variablesIn(text: string): string[] {
  return Array.from(text.matchAll(VAR_RE), (m) => m[1]!);
}

/** Variables in the text that don't exist for these modules. */
export function unknownVariables(text: string, allowed: string[] = ALL_VARIABLES): string[] {
  return Array.from(new Set(variablesIn(text).filter((v) => !allowed.includes(v))));
}

export function fillVariables(text: string, values: Record<string, string | undefined>): string {
  return text.replace(VAR_RE, (_, name: string) => values[name] ?? '');
}

/* ---------- Texts ---------- */

/** The system adds this to every automated text; the user doesn't type it. */
export const optOutLine = (orgName: string) => ` – ${orgName}. Reply STOP to opt out`;

export const SMS_MAX = 480;

/** Characters and text parts (160 per part, 153 each once it splits), counting the opt-out line. */
export function smsParts(body: string, orgName: string): { chars: number; parts: number } {
  const chars = (body + optOutLine(orgName)).length;
  return { chars, parts: chars <= 160 ? 1 : Math.ceil(chars / 153) };
}

/* ---------- Guide and samples ---------- */

export interface SampleMessage {
  id: string;
  name: string;
  channel: 'EMAIL' | 'SMS';
  subject?: string;
  body: string;
  category: MessageCategory;
  /** The guide can't be deleted and opens first in "Start from the message guide". */
  isGuide?: boolean;
}

export const MESSAGE_GUIDE_EMAIL: SampleMessage = {
  id: 'sample_guide_email', name: 'Message guide (email)', channel: 'EMAIL', category: 'OTHER', isGuide: true,
  subject: '[What this is about] for {{projectName}}',
  body: `Hi {{customerName}},

[One sentence: what just happened.]
Example: We've received your deposit, thank you.

[One sentence: what happens next, and when.]
Example: Our scheduling team will confirm your start date within 2 working days.

[One sentence: what you need from them, if anything.]
Example: If anything about the job has changed, reply to this email.

Thanks,
{{orgName}}`,
};

export const MESSAGE_GUIDE_SMS: SampleMessage = {
  id: 'sample_guide_sms', name: 'Message guide (text)', channel: 'SMS', category: 'OTHER', isGuide: true,
  body: 'Hi {{customerName}}, [what happened]. [What happens next].',
};

export const GUIDE_TIPS = [
  "Keep it to what happened, what's next, and what you need from them.",
  'Say when, not "soon".',
  'Use variables for names, dates and amounts, so the message is always right.',
  'Send yourself a test before you deploy.',
];

const email = (id: string, name: string, subject: string, body: string, category: MessageCategory = 'OTHER'): SampleMessage => ({ id, name, channel: 'EMAIL', subject, body, category });
const text = (id: string, name: string, body: string, category: MessageCategory = 'REMINDER'): SampleMessage => ({ id, name, channel: 'SMS', body, category });

/** One sample per customer-facing step in the system journeys (spec 9). They follow the guide. */
export const SAMPLE_MESSAGES: SampleMessage[] = [
  email('sample_lead_received', "We've got your request", "We've got your request, {{firstName}}",
    "Hi {{customerName}},\n\nThanks for contacting {{orgName}}. We've received your request for a painting estimate.\n\nOne of our estimators will call you within 1 working hour to book a visit.\n\nIf it's easier, reply to this email with a good time to call.\n\nThanks,\n{{orgName}}", 'REPLY'),
  email('sample_welcome_back', 'Welcome back', 'Welcome back, {{firstName}}',
    "Hi {{customerName}},\n\nThanks for coming back to {{orgName}}. We've received your request.\n\nWe already have the details of your last project, so we'll call you within 1 working hour to book a quick visit.\n\nReply to this email if anything has changed at the property.\n\nThanks,\n{{orgName}}", 'REPLY'),
  email('sample_appointment_confirmed', 'Appointment confirmed', 'Your estimate visit on {{appointmentDate}}',
    'Hi {{customerName}},\n\nYour estimate visit is booked for {{appointmentDate}} at {{appointmentTime}} with {{estimatorName}}.\n\nThe visit takes about an hour, and your written estimate follows within 2 working days.\n\nIf you need a different time, reply to this email.\n\nThanks,\n{{orgName}}', 'REPLY'),
  text('sample_see_you_tomorrow', 'See you tomorrow', 'Hi {{firstName}}, {{estimatorName}} will see you tomorrow at {{appointmentTime}} for your estimate visit.'),
  email('sample_estimate_sent', 'Estimate sent', 'Your estimate for {{projectName}}',
    'Hi {{customerName}},\n\nYour estimate for {{projectName}} is ready: {{estimateTotal}}. You can read and sign it here: {{estimateLink}}\n\nOnce you sign, we send the deposit invoice and book your start date.\n\nReply with any questions about the scope or colours.\n\nThanks,\n{{orgName}}'),
  email('sample_estimate_follow_up', 'Any questions about your estimate?', 'Any questions about your estimate?',
    "Hi {{customerName}},\n\nWe sent your estimate for {{projectName}} a few days ago.\n\nIf you're ready, you can sign it here: {{estimateLink}}. We'll then book your start date.\n\nIf you have questions, reply to this email and {{estimatorName}} will call you.\n\nThanks,\n{{orgName}}", 'REMINDER'),
  email('sample_deposit_invoice', 'Deposit invoice sent', 'Deposit invoice {{invoiceNumber}} for {{projectName}}',
    'Hi {{customerName}},\n\nThanks for accepting your estimate. Your deposit invoice {{invoiceNumber}} is for {{invoiceAmount}}.\n\nAs soon as the deposit is paid, we confirm your start date.\n\nReply to this email if you have any questions about the invoice.\n\nThanks,\n{{orgName}}'),
  email('sample_deposit_reminder', 'Deposit reminder', 'Reminder: deposit for {{projectName}}',
    "Hi {{customerName}},\n\nYour deposit invoice {{invoiceNumber}} for {{invoiceAmount}} hasn't been paid yet.\n\nWe can book your start date as soon as it is paid.\n\nIf you've already paid, reply to this email and we'll check.\n\nThanks,\n{{orgName}}", 'REMINDER'),
  email('sample_deposit_received', 'Deposit received', "We've received your deposit",
    "Hi {{customerName}},\n\nWe've received your deposit, thank you.\n\nOur scheduling team will confirm your start date within 2 working days.\n\nIf anything about the job has changed, reply to this email.\n\nThanks,\n{{orgName}}", 'REPLY'),
  email('sample_start_confirmed', 'Start date confirmed', 'Your start date: {{startDate}}',
    'Hi {{customerName}},\n\nYour project {{projectName}} starts on {{startDate}}. {{crewLeadName}} leads the crew.\n\nWe send a reminder 2 days before we arrive.\n\nPlease clear the work areas the evening before, or reply if you need help with that.\n\nThanks,\n{{orgName}}', 'REPLY'),
  text('sample_we_start_monday', 'We start soon', 'Hi {{firstName}}, a reminder that our crew starts {{projectName}} on {{startDate}}. Please clear the work areas the evening before.'),
  email('sample_moving_start', "We're moving your start date", "We're moving your start date",
    'Hi {{customerName}},\n\nThe weather forecast for {{startDate}} is not safe for exterior painting, so we are moving your start date.\n\nWe will send your new date within 1 working day.\n\nReply to this email if some dates do not suit you.\n\nThanks,\n{{orgName}}', 'REMINDER'),
  email('sample_approve_colours', 'Please approve your colours', 'Please approve your colours for {{projectName}}',
    'Hi {{customerName}},\n\nYour colour card for {{projectName}} is ready to approve.\n\nWe order paint as soon as every colour is approved, so please reply within 3 days.\n\nReply to this email with any changes.\n\nThanks,\n{{orgName}}', 'REMINDER'),
  email('sample_cabinets_curing', 'Your cabinets are curing', 'Your cabinets are curing',
    "Hi {{customerName}},\n\nThe painting is done and your cabinets are now curing.\n\nWe'll be back in 3 days for the final check. Please handle doors and drawers gently until then.\n\nReply to this email with any questions.\n\nThanks,\n{{orgName}}"),
  email('sample_job_complete', 'Job complete', '{{projectName}} is complete',
    'Hi {{customerName}},\n\nThe crew has finished {{projectName}}.\n\n{{crewLeadName}} will walk through the work with you for the final inspection.\n\nIf you notice anything you would like us to look at, reply to this email.\n\nThanks,\n{{orgName}}'),
  email('sample_final_invoice', 'Final invoice sent', 'Final invoice {{invoiceNumber}} for {{projectName}}',
    'Hi {{customerName}},\n\nThanks for choosing {{orgName}}. Your final invoice {{invoiceNumber}} is for {{balanceDue}}, due on {{dueDate}}.\n\nOnce it is paid, your project is closed and your paint record is ready.\n\nReply to this email with any questions.\n\nThanks,\n{{orgName}}'),
  email('sample_payment_reminder', 'Payment reminder', 'Reminder: invoice {{invoiceNumber}} is overdue',
    "Hi {{customerName}},\n\nInvoice {{invoiceNumber}} for {{balanceDue}} was due on {{dueDate}} and hasn't been paid yet.\n\nPlease pay it this week so we can close your project.\n\nIf you've already paid, reply and we'll check our records.\n\nThanks,\n{{orgName}}", 'REMINDER'),
  email('sample_payment_thanks', 'Payment received, thank you', 'Thank you for your payment',
    "Hi {{customerName}},\n\nWe've received your final payment for {{projectName}}, thank you.\n\nYour project is now closed. We keep a record of your colours for future touch-ups.\n\nReply to this email if you need anything.\n\nThanks,\n{{orgName}}", 'REPLY'),
  email('sample_review_request', 'Review request', 'How did we do, {{firstName}}?',
    'Hi {{customerName}},\n\nThanks again for choosing {{orgName}} for {{projectName}}.\n\nIf you were happy with the work, a short review helps other homeowners find us: {{reviewLink}}\n\nIf anything wasn\'t right, reply to this email and we\'ll fix it.\n\nThanks,\n{{orgName}}'),
  email('sample_repaint_check_in', 'Time for a refresh?', 'Time for a refresh, {{firstName}}?',
    "Hi {{customerName}},\n\nIt's been a few years since we painted your home. Paint in busy areas usually needs a refresh around now.\n\nWe'd be glad to visit and give you a free estimate. We still have your colours on file.\n\nReply to this email to book a visit.\n\nThanks,\n{{orgName}}"),
  email('sample_touch_up_confirmed', 'Touch-up visit confirmed', 'Your touch-up visit is booked',
    "Hi {{customerName}},\n\nYour touch-up visit is booked. {{crewLeadName}} will come out with your original colours.\n\nWe'll send a reminder the day before.\n\nReply to this email if you need a different time.\n\nThanks,\n{{orgName}}", 'REPLY'),
  text('sample_touch_up_reminder', 'Touch-up visit tomorrow', 'Hi {{firstName}}, a reminder that we visit tomorrow for your touch-up.'),
  email('sample_all_done', 'All done', 'Your touch-up is done',
    "Hi {{customerName}},\n\nWe've finished your touch-up visit.\n\nYour paint record is updated with today's work.\n\nReply to this email if anything needs another look.\n\nThanks,\n{{orgName}}"),
];

export const ALL_SAMPLES: SampleMessage[] = [MESSAGE_GUIDE_EMAIL, MESSAGE_GUIDE_SMS, ...SAMPLE_MESSAGES];

export const sampleById = (id: string) => ALL_SAMPLES.find((s) => s.id === id);

/* ---------- Replica collection records ---------- */

/** A library email as a replica AutomatedMessage (Settings › Automated Messages). */
export function toAutomatedMessage(id: string, input: { name: string; subject?: string; body: string; category?: MessageCategory }): AutomatedMessage {
  return {
    id, name: input.name, trigger: 'Automation', channel: 'EMAIL', delayValue: 0, delayUnit: 'minutes', subject: input.subject ?? '', body: input.body,
    isActive: true, availableVariables: variablesIn(`${input.subject ?? ''} ${input.body}`), mode: 'automatic', automationCategory: input.category ?? 'OTHER',
  };
}

/** A library text as a replica SmsTemplate (Settings › SMS Templates). */
export function toSmsTemplate(id: string, input: { name: string; body: string; category?: MessageCategory }): SmsTemplate {
  return { id, type: 'AUTOMATION', name: input.name, body: input.body, availableVariables: variablesIn(input.body), isDefault: false, automationCategory: input.category ?? 'OTHER' };
}
