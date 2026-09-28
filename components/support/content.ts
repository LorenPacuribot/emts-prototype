/*
  Help & Support content: knowledge base FAQs, video tutorials and contact
  details. Topics and titles match the live app (features/(main)/support/lib).
*/

export const FAQS: { category: string; items: string[] }[] = [
  {
    category: 'Estimates',
    items: [
      'How do I add a new labor rate?',
      'Can I duplicate an existing estimate?',
      'How to apply a global markup?',
      'Exporting estimates to PDF',
    ],
  },
  {
    category: 'Billing',
    items: [
      'Connecting your Stripe account',
      'Processing refunds',
      'Setting up recurring invoices',
      'Viewing transaction history',
    ],
  },
  {
    category: 'Account',
    items: [
      'Changing your password',
      'Adding team members',
      'Updating company logo',
      'Notification settings',
    ],
  },
];

export interface Video {
  id: string;
  title: string;
  duration: string;
  category: string;
  /** CSS gradient used as the thumbnail (no external images) */
  thumb: string;
  about: string;
}

export const VIDEOS: Video[] = [
  { id: 'v1', title: 'Getting Started Guide', duration: '5:20', category: 'Basics', thumb: 'linear-gradient(135deg,#1e3a8a 0%,#2563eb 55%,#60a5fa 100%)', about: 'Set up your account, configure your first estimate template and send it to a client.' },
  { id: 'v2', title: 'Building Complex Estimates', duration: '12:45', category: 'Advanced', thumb: 'linear-gradient(135deg,#312e81 0%,#7a5fff 55%,#c2b7ff 100%)', about: 'Use areas, surface rates, difficulty tiers and extras to price large multi-room projects.' },
  { id: 'v3', title: 'Managing Crew Schedules', duration: '8:10', category: 'Operations', thumb: 'linear-gradient(135deg,#064e3b 0%,#10b981 55%,#a7f3d0 100%)', about: 'Schedule jobs, assign crew members and track production on the calendar.' },
  { id: 'v4', title: 'Invoicing & Payments', duration: '6:30', category: 'Finance', thumb: 'linear-gradient(135deg,#7c2d12 0%,#ea580c 55%,#fdba74 100%)', about: 'Create invoices from jobs, record deposits and payments, and follow up on balances.' },
];

export const SUPPORT_PHONE = '(555) 123-4567';
export const SUPPORT_EMAIL = 'support@estimatemaster.com';

/** The live app shows the same short answer for every article. */
export function faqAnswer(question: string) {
  const topic = question.toLowerCase().replace('how do i ', '').replace('?', '');
  return `To ${topic}, navigate to the relevant section in the sidebar. For detailed steps, please refer to our full documentation guide or contact support if you need specific account assistance.`;
}
