'use client';

/*
  Creates a work order for a job. Opened from the job detail page (job fixed)
  or from the Work Orders list (pick a job). The number comes from Document
  Numbering (useNextNumber('WORK_ORDER')). Assignees default to the job's
  crew, the due date to the job's end date, and the checklist to one task per
  estimate area, so the crew gets a useful starting list.
*/
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from '@/components/Modals/Modal';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input, NativeSelect, Textarea } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import { useCollection, useLookups, useLogActivity, useNextNumber } from '@/lib/store';
import { fullName, uid } from '@/lib/utils';
import { useJobActions } from '@/components/jobs/useJobActions';

export function CreateWorkOrderModal({ open, onOpenChange, jobId: fixedJobId }: { open: boolean; onOpenChange: (v: boolean) => void; jobId?: string }) {
  const { items: jobs } = useCollection('jobs');
  const { items: team } = useCollection('team');
  const { add } = useCollection('workOrders');
  const look = useLookups();
  const nextNumber = useNextNumber();
  const log = useLogActivity();
  const { change } = useJobActions();
  const { toast } = useToast();
  const router = useRouter();

  const [jobId, setJobId] = useState('');
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [assigned, setAssigned] = useState<string[]>([]);
  const [instructions, setInstructions] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Fill defaults from the chosen job.
  const seed = (id: string) => {
    const j = look.job(id);
    setJobId(id);
    setTitle(j ? j.title : '');
    setDueDate(j?.endDate ?? '');
    setAssigned(j ? j.crew.map((c) => c.memberId) : []);
  };

  useEffect(() => {
    if (!open) return;
    seed(fixedJobId ?? '');
    setInstructions('');
    setErrors({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, fixedJobId]);

  const save = () => {
    const e: Record<string, string> = {};
    if (!jobId) e.job = 'Pick a job';
    if (!title.trim()) e.title = 'Title is required';
    if (!dueDate) e.dueDate = 'Due date is required';
    setErrors(e);
    if (Object.keys(e).length) return;
    const job = look.job(jobId)!;
    const est = look.estimate(job.estimateId);
    const number = nextNumber('WORK_ORDER');
    const wo = add({
      id: number,
      workOrderNumber: number,
      jobId,
      title: title.trim(),
      status: 'Open',
      assignedTo: assigned,
      dueDate,
      instructions: instructions.trim(),
      tasks: (est?.areas ?? []).map((a) => ({ id: uid('t'), text: a.name, done: false })),
      createdAt: new Date().toISOString(),
    });
    change(jobId, {}, `Work order ${number} created`);
    log(`${number} created for ${job.jobNumber}`, 'job', jobId);
    toast(`Work order ${number} created`);
    onOpenChange(false);
    router.push(`/work-orders/${wo.id}`);
  };

  const crew = team.filter((t) => t.isCrew && t.status !== 'Inactive');
  const openJobs = jobs.filter((j) => j.status !== 'Cancelled');

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title="Create Work Order"
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save}>Create Work Order</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Job" required error={errors.job}>
          <NativeSelect value={jobId} disabled={!!fixedJobId} onChange={(e) => seed(e.target.value)}>
            <option value="">Select a job…</option>
            {openJobs.map((j) => <option key={j.id} value={j.id}>{j.jobNumber} — {j.title}</option>)}
          </NativeSelect>
        </Field>
        <Field label="Title" required error={errors.title}>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Exterior prep & prime" invalid={!!errors.title} />
        </Field>
        <Field label="Due Date" required error={errors.dueDate}>
          <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} invalid={!!errors.dueDate} />
        </Field>
        <Field label="Assigned Crew">
          <div className="grid grid-cols-2 gap-2 rounded-lg border border-gray-200 p-3">
            {crew.map((m) => (
              <Checkbox key={m.id} checked={assigned.includes(m.id)} label={fullName(m)}
                onChange={(v) => setAssigned((a) => (v ? [...a, m.id] : a.filter((x) => x !== m.id)))} />
            ))}
          </div>
        </Field>
        <Field label="Instructions" hint="Checklist tasks are created from the estimate's areas. You can edit them after.">
          <Textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="Prep, colors, access notes…" />
        </Field>
      </div>
    </Modal>
  );
}
