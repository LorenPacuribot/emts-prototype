'use client';

/*
  Printable work order (/work-orders/[id]/print).
  A plain, paper-friendly sheet for the crew: company, job, customer, site
  address, schedule, crew, instructions and a checkbox task list. The
  toolbar and app chrome are hidden when printing.
*/
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { woDisplayStatus } from '@/components/work-orders/wo-utils';
import { useCollection, useLookups, useSingleton } from '@/lib/store';
import { useWoTwin } from '@/components/work-orders/WoFeatures';
import { fullName, shortDate } from '@/lib/utils';
import { fmtTime } from '@/components/scheduling/schedule-utils';

// Lets the page grow past one screen when printing (the app shell is a fixed-height scroller).
const PRINT_CSS = '@media print { html, body, body > div, body > div > div { height: auto !important; overflow: visible !important; } @page { margin: 14mm; } }';

export default function WorkOrderPrintPage() {
  const { id } = useParams<{ id: string }>();
  const { get } = useCollection('workOrders');
  const look = useLookups();
  const [biz] = useSingleton('businessProfile');
  const wo = get(id);
  const twin = useWoTwin(id);

  if (!wo) return <div className="p-10 text-center text-gray-500">Work order not found.</div>;
  const job = look.job(wo.jobId);
  const customer = look.customer(job?.customerId);
  const company = biz.companyName || 'Estimate Master';

  return (
    <div className="flex-1 overflow-auto bg-gray-100 print:bg-white">
      <style>{PRINT_CSS}</style>
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-6 py-3 print:hidden">
        <Link href={`/work-orders/${wo.id}`} className="flex items-center gap-2 text-sm font-bold text-gray-500 hover:text-gray-900"><ArrowLeft className="h-4 w-4" /> Back to Work Order</Link>
        <Button icon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>Print</Button>
      </div>

      <div className="mx-auto my-8 max-w-[800px] bg-white p-10 text-gray-900 shadow-sm print:my-0 print:max-w-none print:p-0 print:shadow-none">
        <div className="flex items-start justify-between border-b-2 border-gray-900 pb-4">
          <div>
            <div className="font-heading text-2xl font-extrabold">{company}</div>
            <div className="text-sm text-gray-500">{[biz.phone, biz.email].filter(Boolean).join(' · ') || 'Work Order'}</div>
          </div>
          <div className="text-right">
            <div className="font-mono text-lg font-bold">{wo.workOrderNumber}</div>
            <div className="text-sm">Status: {woDisplayStatus(wo, job, twin?.wo.status)}</div>
            <div className="text-sm">Due: {shortDate(wo.dueDate)}</div>
          </div>
        </div>

        <h1 className="mt-6 text-xl font-bold">{wo.title}</h1>
        <p className="text-sm text-gray-600">{job ? `${job.jobNumber} · ${job.title}` : 'No linked job'}</p>

        <div className="mt-6 grid grid-cols-2 gap-6 text-sm">
          <div>
            <div className="mb-1 text-[11px] font-bold uppercase tracking-widest text-gray-500">Customer</div>
            <div className="font-bold">{fullName(customer)}</div>
            <div>{customer?.phone}</div>
            <div>{customer?.email}</div>
          </div>
          <div>
            <div className="mb-1 text-[11px] font-bold uppercase tracking-widest text-gray-500">Job Site</div>
            <div>{job?.address || 'No address set'}</div>
          </div>
          <div>
            <div className="mb-1 text-[11px] font-bold uppercase tracking-widest text-gray-500">Schedule</div>
            <div>{job?.startDate ? `${shortDate(job.startDate)} – ${shortDate(job.endDate)}` : 'Not scheduled'}</div>
            {job?.startTime && <div>{fmtTime(job.startTime)} – {fmtTime(job.endTime)}</div>}
          </div>
          <div>
            <div className="mb-1 text-[11px] font-bold uppercase tracking-widest text-gray-500">Crew</div>
            {wo.assignedTo.length ? wo.assignedTo.map((m) => <div key={m}>{fullName(look.member(m))}</div>) : <div>Unassigned</div>}
          </div>
        </div>

        <div className="mt-6">
          <div className="mb-1 text-[11px] font-bold uppercase tracking-widest text-gray-500">Instructions</div>
          <p className="whitespace-pre-wrap rounded border border-gray-300 p-3 text-sm">{wo.instructions || '--'}</p>
        </div>

        <div className="mt-6">
          <div className="mb-2 text-[11px] font-bold uppercase tracking-widest text-gray-500">Tasks</div>
          <table className="w-full border-collapse text-sm">
            <tbody>
              {wo.tasks.map((t, i) => (
                <tr key={t.id} className="border-b border-gray-200">
                  <td className="w-8 py-2"><span className="inline-block h-4 w-4 border border-gray-500 text-center text-[11px] leading-4">{t.done ? '✓' : ''}</span></td>
                  <td className="py-2">{i + 1}. {t.text}</td>
                  <td className="w-32 py-2 text-right text-gray-400">Initials ______</td>
                </tr>
              ))}
              {wo.tasks.length === 0 && <tr><td className="py-2 text-gray-400">No tasks.</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="mt-12 grid grid-cols-2 gap-10 text-sm">
          <div className="border-t border-gray-500 pt-1">Crew Lead Signature</div>
          <div className="border-t border-gray-500 pt-1">Customer Signature</div>
        </div>
      </div>
    </div>
  );
}
