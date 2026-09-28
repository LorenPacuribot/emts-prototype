'use client';

/*
  Add / Edit Team Member modal with two tabs, like the live app:
  - Profile & Access: photo, full name, role, phone, email, active status and
    a read-only preview of the role's access permissions.
  - Schedule Availability: week-by-week working hours (Sun..Sat) with
    week navigation and "Copy Previous Week".
  Saving writes to the `team` collection. Weekly capacity (capacityHours) is
  recalculated from the current week's working hours.
*/
import React, { useMemo, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Clock, Copy, Info, Shield, Trash2, Upload, User } from 'lucide-react';
import { Modal } from '@/components/Modals/Modal';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Switch } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import { useCollection } from '@/lib/store';
import { PERMISSION_GROUPS } from '@/lib/sampleData';
import { cn, fullName, toISODate } from '@/lib/utils';
import type { TeamMember, TeamRole } from '@/lib/types';
import { digitsOnly, formatPhone, readImageFile, SegmentedToggle } from '@/components/settings/config/ui';

type Day = { start: string; end: string; working: boolean };
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const TEAM_ROLES: TeamRole[] = ['Owner', 'Admin', 'Estimator', 'Project Manager', 'Crew Lead', 'Painter', 'Office'];
const COLORS = ['#2563EB', '#7A5FFF', '#F97316', '#22C55E', '#06B6D4', '#EC4899', '#EAB308', '#EF4444'];

/** Default week: Mon-Fri 8am-5pm working, weekend off. */
const defaultWeek = (): Day[] => DAY_NAMES.map((_, i) => ({ start: '08:00', end: '17:00', working: i >= 1 && i <= 5 }));

const sundayOf = (d: Date) => {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - x.getDay());
  return x;
};
const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
const hoursOf = (week: Day[]) =>
  week.reduce((sum, d) => {
    if (!d.working) return sum;
    const [sh, sm] = d.start.split(':').map(Number);
    const [eh, em] = d.end.split(':').map(Number);
    return sum + Math.max(0, (eh! * 60 + em! - (sh! * 60 + sm!)) / 60);
  }, 0);

export function MemberFormModal({
  open, onOpenChange, mode, member, defaultTab = 'profile', onDelete,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  mode: 'add' | 'edit';
  member?: TeamMember;
  defaultTab?: 'profile' | 'schedule';
  onDelete?: () => void;
}) {
  const { items: team, add, update } = useCollection('team');
  const { items: roles } = useCollection('roles');
  const { toast } = useToast();

  const [tab, setTab] = useState<'profile' | 'schedule'>(defaultTab);
  const [state, setState] = useState({
    fullName: member ? fullName(member) : '',
    roleId: member?.roleId ?? '',
    phone: digitsOnly(member?.phone ?? ''),
    email: member?.email ?? '',
    isActive: member ? member.status !== 'Inactive' : true,
    photo: member?.photoUrl ?? '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [photoError, setPhotoError] = useState('');

  // Schedule: one entry per week start (YYYY-MM-DD). Starts from what is saved.
  const thisWeek = useMemo(() => sundayOf(new Date()), []);
  const [weekStart, setWeekStart] = useState(thisWeek);
  const [schedule, setSchedule] = useState<Record<string, Day[]>>(() => structuredClone(member?.schedule ?? {}));
  const weekKey = toISODate(weekStart);
  const prevKey = toISODate(addDays(weekStart, -7));
  const week = schedule[weekKey] ?? defaultWeek();

  const role = roles.find((r) => r.id === state.roleId);
  const isOwner = mode === 'edit' && role?.name === 'Owner';

  const set = <K extends keyof typeof state>(k: K, v: (typeof state)[K]) => {
    setState((s) => ({ ...s, [k]: v }));
    if (errors[k as string]) setErrors((e) => ({ ...e, [k as string]: '' }));
  };

  const setDay = (i: number, patch: Partial<Day>) =>
    setSchedule((s) => ({ ...s, [weekKey]: (s[weekKey] ?? defaultWeek()).map((d, j) => (j === i ? { ...d, ...patch } : d)) }));

  const onPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const res = await readImageFile(file, 5);
    if (res.error) return setPhotoError(res.error);
    setPhotoError('');
    set('photo', res.url!);
  };

  const submit = () => {
    const e: Record<string, string> = {};
    if (!state.fullName.trim()) e.fullName = 'First name is required';
    if (!state.roleId) e.roleId = 'Role is required';
    if (!state.phone) e.phone = 'Phone is required';
    else if (state.phone.length < 10) e.phone = 'Phone number must be 10 digits';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.email)) e.email = 'Invalid email address';
    else if (team.some((t) => t.email.toLowerCase() === state.email.toLowerCase() && t.id !== member?.id)) e.email = 'A team member with this email already exists';
    setErrors(e);
    if (Object.keys(e).length) {
      setTab('profile');
      return;
    }
    for (const d of Object.values(schedule).flat()) {
      if (d.working && d.end <= d.start) {
        setTab('schedule');
        toast('End time must be after start time on working days', 'error');
        return;
      }
    }
    const [firstName, ...rest] = state.fullName.trim().split(/\s+/);
    const roleLabel = (TEAM_ROLES as string[]).includes(role!.name) ? (role!.name as TeamRole) : role!.name.startsWith('Crew') ? 'Painter' : 'Office';
    const capacity = Math.round(hoursOf(schedule[toISODate(thisWeek)] ?? defaultWeek()));
    const patch = {
      firstName: firstName!,
      lastName: rest.join(' '),
      email: isOwner ? member!.email : state.email.trim(),
      phone: state.phone,
      roleId: state.roleId,
      role: roleLabel,
      photoUrl: state.photo || undefined,
      schedule,
      capacityHours: capacity,
      isCrew: /crew|painter|apprentice|foreman/i.test(role!.name),
    };
    if (mode === 'edit' && member) {
      const status: TeamMember['status'] = !state.isActive ? 'Inactive' : member.status === 'Inactive' ? 'Active' : member.status;
      update(member.id, { ...patch, status });
      toast('Team member updated successfully');
    } else {
      add({ ...patch, status: state.isActive ? 'Invited' : 'Inactive', hourlyRate: 0, color: COLORS[team.length % COLORS.length]! });
      toast(`Invitation sent to ${state.email.trim()}`);
    }
    onOpenChange(false);
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={mode === 'add' ? 'Add Team Member' : 'Edit Team Member'}
      size="md"
      footer={
        <div className="flex w-full gap-3">
          {mode === 'edit' && tab === 'profile' && onDelete && (
            <Button variant="danger" onClick={onDelete} title="Remove Member" aria-label="Remove Member" className="px-3">
              <Trash2 className="h-5 w-5" />
            </Button>
          )}
          <Button variant="secondary" className="flex-1" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="flex-[2]" onClick={submit}>Save Member</Button>
        </div>
      }
    >
      <div className="mb-6">
        <SegmentedToggle value={tab} onChange={setTab} options={[{ value: 'profile', label: 'Profile & Access' }, { value: 'schedule', label: 'Schedule Availability' }]} />
      </div>

      {tab === 'profile' ? (
        <div className="space-y-5">
          <div className="flex flex-col items-center">
            <label className="group relative mb-2 cursor-pointer">
              <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border-4 border-gray-100 bg-gray-100 shadow-sm">
                {state.photo ? <img src={state.photo} alt="Profile" className="h-full w-full object-cover" /> : <User className="h-9 w-9 text-gray-300" />}
              </div>
              <span className="absolute inset-0 flex flex-col items-center justify-center rounded-full bg-black/40 text-white opacity-0 transition-opacity group-hover:opacity-100">
                <Upload className="mb-1 h-5 w-5" />
                <span className="text-[9px] font-bold uppercase">Change</span>
              </span>
              <input type="file" accept="image/*" className="hidden" onChange={onPhoto} />
            </label>
            <span className="text-xs font-medium text-gray-400">Upload Profile Picture</span>
            {photoError && <span className="mt-1 text-xs text-red-600">{photoError}</span>}
          </div>

          <Field label="Full Name" required error={errors.fullName}>
            <Input value={state.fullName} placeholder="e.g. John Doe" invalid={!!errors.fullName} onChange={(e) => set('fullName', e.target.value)} />
          </Field>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Role" required error={errors.roleId}>
              <Select
                value={state.roleId}
                onChange={(v) => set('roleId', v)}
                placeholder="Select role"
                invalid={!!errors.roleId}
                options={roles.map((r) => ({ value: r.id, label: r.name }))}
              />
            </Field>
            <Field label="Phone Number" required error={errors.phone}>
              <Input value={formatPhone(state.phone)} placeholder="(555) 123-4567" invalid={!!errors.phone} onChange={(e) => set('phone', digitsOnly(e.target.value))} />
            </Field>
          </div>
          <Field label="Email Address" required={mode === 'add'} error={errors.email} hint={isOwner ? 'Email cannot be changed for the organization owner' : undefined}>
            <Input
              type="email"
              value={isOwner ? member!.email : state.email}
              disabled={isOwner}
              placeholder="john@example.com"
              invalid={!!errors.email}
              onChange={(e) => set('email', e.target.value)}
            />
          </Field>

          <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 p-4">
            <div>
              <div className="text-sm font-bold text-gray-900">Active Status</div>
              <div className="text-xs text-gray-500">Allow assignment to new jobs</div>
            </div>
            <Switch checked={state.isActive} onChange={(v) => set('isActive', v)} label="Active status" />
          </div>

          <div className="border-t border-gray-100 pt-4">
            <h4 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-gray-500">
              <Shield className="h-4 w-4" /> Access Permissions
            </h4>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {PERMISSION_GROUPS.map((g) => {
                const active = g.keys.filter((k) => role?.permissions.includes(k.key));
                const has = active.length > 0;
                return (
                  <div key={g.module} className={cn('flex items-start gap-3 rounded-xl border p-3', has ? 'border-primary-300 bg-primary-50' : 'border-gray-200 bg-white')}>
                    <span className={cn('mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border', has ? 'border-primary-500 bg-primary-500 text-white' : 'border-gray-300 bg-white')}>
                      {has && <Check className="h-3.5 w-3.5" />}
                    </span>
                    <div className="min-w-0">
                      <div className={cn('text-sm font-bold', has ? 'text-primary-900' : 'text-gray-700')}>{g.module}</div>
                      <div className="text-xs text-gray-500">{has ? active.map((k) => k.label).join(', ') : 'No access'}</div>
                    </div>
                  </div>
                );
              })}
            </div>
            {state.roleId && (
              <div className="mt-3 flex items-center gap-2 text-xs text-gray-400">
                <Info className="h-3.5 w-3.5 shrink-0" />
                <span>Permissions are managed in Settings → Roles & Permissions</span>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50 p-2">
            <button type="button" onClick={() => setWeekStart(addDays(weekStart, -7))} className="rounded-lg p-2 text-gray-500 shadow-sm hover:bg-white" aria-label="Previous week">
              <ChevronLeft className="h-5 w-5" />
            </button>
            <div className="flex flex-col items-center">
              <div className="text-sm font-bold text-gray-900">
                Week of {weekStart.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </div>
              {weekStart.getTime() !== thisWeek.getTime() && (
                <button type="button" onClick={() => setWeekStart(thisWeek)} className="text-[10px] font-bold uppercase tracking-wider text-primary-600 hover:underline">
                  Return to current week
                </button>
              )}
            </div>
            <button type="button" onClick={() => setWeekStart(addDays(weekStart, 7))} className="rounded-lg p-2 text-gray-500 shadow-sm hover:bg-white" aria-label="Next week">
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>

          {schedule[prevKey] && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setSchedule((s) => ({ ...s, [weekKey]: structuredClone(s[prevKey]!) }))}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold text-primary-600 hover:bg-primary-50"
              >
                <Copy className="h-3.5 w-3.5" /> Copy Previous Week
              </button>
            </div>
          )}

          {week.map((d, i) => {
            const date = addDays(weekStart, i);
            return (
              <div key={i} className={cn('flex items-center gap-3 rounded-xl border p-3', d.working ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50 opacity-60')}>
                <div className="w-14 shrink-0">
                  <div className="text-sm font-bold text-gray-900">{DAY_NAMES[i]}</div>
                  <div className="text-[11px] text-gray-500">{date.getDate()} {date.toLocaleDateString('en-US', { month: 'short' })}</div>
                </div>
                <div className="grid flex-1 grid-cols-2 gap-2">
                  {(['start', 'end'] as const).map((k) => (
                    <div key={k} className="relative">
                      <Clock className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                      <input
                        type="time"
                        aria-label={`${DAY_NAMES[i]} ${k} time`}
                        value={d[k]}
                        disabled={!d.working}
                        onChange={(e) => setDay(i, { [k]: e.target.value || (k === 'start' ? '08:00' : '17:00') })}
                        className="h-9 w-full rounded-lg border border-gray-200 bg-white pl-8 pr-2 text-xs font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary-400/40 disabled:bg-gray-50"
                      />
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setDay(i, { working: !d.working })}
                  className={cn('w-20 shrink-0 rounded-lg px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider', d.working ? 'bg-green-50 text-green-700 hover:bg-green-100' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}
                >
                  {d.working ? 'Working' : 'Off'}
                </button>
              </div>
            );
          })}
          <p className="text-right text-xs text-gray-500">{hoursOf(week).toFixed(1)} hours this week</p>
        </div>
      )}
    </Modal>
  );
}
