'use client';

/*
  Top of the estimate "document" in the builder:
  - DocHeader: title ("Interior Estimate"), company info, and the Estimator
    button (opens a picker of team members).
  - ClientInfo: Client / Job Site / Dates columns. Each column opens a small
    edit modal when the estimate is editable.
*/
import React, { useState } from 'react';
import { ChevronDown, Edit2, Paintbrush, UserCircle } from 'lucide-react';
import type { BusinessProfile, Customer, Estimate, TeamMember } from '@/lib/types';
import { Modal } from '@/components/Modals/Modal';
import { Button } from '@/components/ui/button';
import { Field, Input, NativeSelect } from '@/components/ui/form';
import { cn, fullName, longDate, toISODate } from '@/lib/utils';
import { pressable } from '@/lib/a11y';

export function CompanyBlock({ bp }: { bp: BusinessProfile }) {
  return (
    <div className="flex flex-col items-center gap-3 text-center lg:flex-row lg:gap-4 lg:text-left">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 text-white shadow-lg shadow-primary-500/30">
        <Paintbrush className="h-7 w-7" />
      </div>
      <div>
        <div className="font-heading text-2xl font-black uppercase leading-none tracking-tight text-gray-900">{bp.companyName || 'Estimate Master'}</div>
        <div className="mt-1 space-y-0.5 text-xs font-medium text-gray-500 md:text-sm">
          <p>{[bp.street, bp.city, bp.state].filter(Boolean).join(', ')}</p>
          {bp.licenseNumber && <p className="text-gray-500">license #{bp.licenseNumber}</p>}
        </div>
      </div>
    </div>
  );
}

export function DocHeader({
  estimate, bp, estimator, team, readOnly, onEstimator,
}: { estimate: Estimate; bp: BusinessProfile; estimator?: TeamMember; team: TeamMember[]; readOnly: boolean; onEstimator: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="p-4 pb-4 md:p-12 md:pb-8">
      <div className="mb-6 text-center md:mb-10">
        <h2 className="mb-2 font-heading text-3xl font-extrabold tracking-tight text-gray-900 md:text-5xl">{estimate.estimateType} Estimate</h2>
        <p className="text-sm font-medium text-gray-500 md:text-lg">Detailed Proposal &amp; Scope of Work</p>
      </div>
      <div className="flex flex-col items-center justify-between gap-6 lg:flex-row">
        <CompanyBlock bp={bp} />
        <div className="flex w-full shrink-0 flex-col items-center lg:w-auto lg:items-end">
          <div className="mb-2 text-xxs font-bold uppercase tracking-widest text-gray-500 md:text-xs">Estimator</div>
          <button
            type="button"
            onClick={readOnly ? undefined : () => setOpen(true)}
            className={cn(
              'group flex items-center gap-4 rounded-2xl py-2 pl-5 pr-4 shadow-sm transition-all',
              estimator ? 'border border-gray-200 bg-white hover:border-primary-300' : 'border border-dashed border-gray-300 bg-gray-50 hover:border-primary-400',
              readOnly && 'cursor-default hover:border-gray-200',
            )}
          >
            {estimator ? (
              <>
                <div className="text-right">
                  <div className="text-sm font-bold text-gray-900 md:text-base">{fullName(estimator)}</div>
                  <div className="text-xs font-medium text-gray-500 md:text-sm">{estimator.phone || estimator.role}</div>
                </div>
                <UserCircle className="h-11 w-11 text-gray-300" />
              </>
            ) : (
              <span className="flex items-center gap-2 py-1 text-sm font-bold text-gray-500 group-hover:text-primary-600">
                Select Estimator <ChevronDown className="h-4 w-4" />
              </span>
            )}
          </button>
          {estimator && <div className="mt-2 hidden text-xs font-medium text-gray-500 lg:block">{estimator.email}</div>}
        </div>
      </div>
      <div className="mt-8 h-px w-full bg-gray-100" />

      <Modal open={open} onOpenChange={setOpen} title="Select Estimator" size="md">
        <div className="space-y-2">
          {team.filter((t) => t.status === 'Active').map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                onEstimator(t.id);
                setOpen(false);
              }}
              className={cn(
                'flex w-full items-center justify-between rounded-xl border p-3 text-left hover:border-primary-300',
                t.id === estimator?.id ? 'border-primary-500 bg-primary-50' : 'border-gray-200',
              )}
            >
              <div>
                <div className="font-bold text-gray-900">{fullName(t)}</div>
                <div className="text-xs text-gray-500">{t.email}</div>
              </div>
              <span className="text-xs font-semibold text-gray-500">{t.role}</span>
            </button>
          ))}
        </div>
      </Modal>
    </div>
  );
}

function Column({ title, editable, onEdit, children, className }: { title: string; editable: boolean; onEdit: () => void; children: React.ReactNode; className?: string }) {
  return (
    <div {...pressable(editable)}
      className={cn('group -m-3 flex flex-col rounded-xl border border-transparent p-3', editable && 'cursor-pointer hover:border-gray-200 hover:bg-gray-50 hover:shadow-sm', className)}
      onClick={editable ? onEdit : undefined}
    >
      <div className="mb-3 flex items-center justify-between border-b border-gray-100 pb-2">
        <h4 className="text-xxs font-bold uppercase tracking-widest text-gray-500 md:text-xs">{title}</h4>
        {editable && (
          <div className="rounded-lg p-1.5 text-gray-300 group-hover:bg-primary-50 group-hover:text-primary-600">
            <Edit2 className="h-3.5 w-3.5" />
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

export function ClientInfo({
  estimate, customer, customers, readOnly, onChange,
}: { estimate: Estimate; customer?: Customer; customers: Customer[]; readOnly: boolean; onChange: (patch: Partial<Estimate>) => void }) {
  const [modal, setModal] = useState<'client' | 'site' | 'dates' | null>(null);
  const [customerId, setCustomerId] = useState(estimate.customerId);
  const [address, setAddress] = useState(estimate.address);
  const [dates, setDates] = useState({ date: '', validUntil: '' });
  const [err, setErr] = useState('');

  const open = (m: 'client' | 'site' | 'dates') => {
    setErr('');
    setCustomerId(estimate.customerId);
    setAddress(estimate.address);
    setDates({ date: toISODate(new Date(estimate.date)), validUntil: toISODate(new Date(estimate.validUntil)) });
    setModal(m);
  };
  const [street, ...rest] = estimate.address.split(', ');

  return (
    <section className="border-b border-gray-200 pb-8 md:pb-12">
      <div className="grid grid-cols-2 gap-x-4 gap-y-8 md:gap-12 lg:grid-cols-3">
        <Column title="Client" editable={!readOnly} onEdit={() => open('client')}>
          {customer ? (
            <div className="space-y-0.5">
              <div className="text-sm font-bold text-gray-900 md:text-xl">{fullName(customer)}</div>
              {customer.companyName && <div className="text-sm text-gray-500">{customer.companyName}</div>}
              <div className="text-xs text-gray-600 md:text-base">{customer.street}</div>
              <div className="text-xs text-gray-600 md:text-base">{customer.city}{customer.city && customer.state ? ', ' : ''}{customer.state} {customer.zip}</div>
              {customer.email && <div className="truncate pt-1.5 text-xs text-gray-500 md:text-sm">{customer.email}</div>}
              {customer.phone && <div className="text-xs text-gray-500 md:text-sm">{customer.phone}</div>}
            </div>
          ) : (
            <div className="text-sm text-gray-500">No client selected</div>
          )}
        </Column>
        <Column title="Job Site" editable={!readOnly} onEdit={() => open('site')}>
          <div className="space-y-0.5">
            <div className="text-sm font-bold text-gray-900 md:text-xl">{street || '—'}</div>
            <div className="text-xs text-gray-600 md:text-base">{rest.join(', ') || 'City, State Zip'}</div>
          </div>
        </Column>
        <Column title="Dates" editable={!readOnly} onEdit={() => open('dates')} className="col-span-2 lg:col-span-1">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="mb-1 text-xxs font-semibold uppercase text-gray-500 md:text-xs">Estimate Date</div>
              <div className="text-sm font-bold text-gray-900 md:text-lg">{longDate(estimate.date)}</div>
            </div>
            <div>
              <div className="mb-1 text-xxs font-semibold uppercase text-gray-500 md:text-xs">Valid Until</div>
              <div className="text-sm font-bold text-gray-900 md:text-lg">{longDate(estimate.validUntil)}</div>
            </div>
          </div>
        </Column>
      </div>

      <Modal
        open={modal === 'client'}
        onOpenChange={(o) => !o && setModal(null)}
        title="Edit Client"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModal(null)}>Cancel</Button>
            <Button
              onClick={() => {
                const c = customers.find((x) => x.id === customerId);
                if (!c) return setErr('Select a client');
                onChange({ customerId: c.id, address: estimate.customerId !== c.id ? [c.street, c.city, c.state].filter(Boolean).join(', ') : estimate.address });
                setModal(null);
              }}
            >
              Save
            </Button>
          </>
        }
      >
        <Field label="Client" required error={err}>
          <NativeSelect value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            {customers.map((c) => <option key={c.id} value={c.id}>{fullName(c)}{c.companyName ? ` (${c.companyName})` : ''}</option>)}
          </NativeSelect>
        </Field>
        <p className="mt-2 text-xs text-gray-500">Changing the client also updates the job site to the client&apos;s address.</p>
      </Modal>

      <Modal
        open={modal === 'site'}
        onOpenChange={(o) => !o && setModal(null)}
        title="Edit Job Site"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModal(null)}>Cancel</Button>
            <Button
              onClick={() => {
                if (!address.trim()) return setErr('Address is required');
                onChange({ address: address.trim() });
                setModal(null);
              }}
            >
              Save
            </Button>
          </>
        }
      >
        <Field label="Job site address" required error={err} hint="Street, City, State">
          <Input value={address} invalid={!!err} onChange={(e) => setAddress(e.target.value)} />
        </Field>
        {customer && (
          <button type="button" className="mt-3 text-xs font-bold text-primary-600 hover:underline" onClick={() => setAddress([customer.street, customer.city, customer.state].filter(Boolean).join(', '))}>
            Use client address
          </button>
        )}
      </Modal>

      <Modal
        open={modal === 'dates'}
        onOpenChange={(o) => !o && setModal(null)}
        title="Edit Dates"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModal(null)}>Cancel</Button>
            <Button
              onClick={() => {
                if (!dates.date || !dates.validUntil) return setErr('Both dates are required');
                if (dates.validUntil < dates.date) return setErr('Valid Until must be on or after the Estimate Date');
                onChange({ date: new Date(dates.date + 'T12:00:00').toISOString(), validUntil: new Date(dates.validUntil + 'T12:00:00').toISOString() });
                setModal(null);
              }}
            >
              Save
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-4">
          <Field label="Estimate Date" required><Input type="date" value={dates.date} onChange={(e) => setDates({ ...dates, date: e.target.value })} /></Field>
          <Field label="Valid Until" required><Input type="date" value={dates.validUntil} onChange={(e) => setDates({ ...dates, validUntil: e.target.value })} /></Field>
        </div>
        {err && <p className="mt-2 text-xs text-red-600">{err}</p>}
      </Modal>
    </section>
  );
}
