'use client';

/*
  Calendar (/calendar)

  Purpose: one place to see estimate appointments and production work.
  - "Estimates" tab: calendar events (estimate appointments, follow ups,
    meetings). Click an event for details; click an empty day or hour to
    schedule a new one.
  - "Production" tab: scheduled jobs across their start..end dates. Clicking
    a job opens the job page.
  Views: Month / Week / Day, plus a Dispatch board (one row per team member).
  The filter narrows by staff member and (on Estimates) by event type.

  Open with ?new=1 to start the "Schedule Estimate" form (used by the
  dashboard "New Event" and "Schedule New" links).
*/
import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Briefcase, Calendar as CalendarIcon, Check, ChevronDown, ChevronLeft, ChevronRight, Columns, Filter,
  LayoutGrid, List, PanelRight, Plus, Ruler, User, Users,
} from 'lucide-react';
import { PageShell } from '@/components/Navigation';
import { Button } from '@/components/ui/button';
import { useCollection, useLookups } from '@/lib/store';
import type { CalendarEvent } from '@/lib/types';
import { cn, fullName } from '@/lib/utils';
import { DispatchView, MonthView, TimeGridView } from '@/components/calendar/CalendarViews';
import { EventDetailsModal, EventFormModal } from '@/components/calendar/EventModals';
import {
  EVENT_TYPES, PERSON_SWATCHES, dayKey, eventToItem, jobToItem, parseDay, sameDay, staffIndexMap, time12,
  weekDays, type CalItem, type CalendarTab, type ViewRange,
} from '@/components/calendar/utils';

/** Segmented control button used for tabs and view toggles. */
function Seg({ active, onClick, children, big }: { active: boolean; onClick: () => void; children: React.ReactNode; big?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex flex-1 items-center justify-center gap-1.5 rounded-lg font-bold transition-all md:flex-none',
        big ? 'px-4 py-2 text-sm' : 'px-3 py-1.5 text-xs',
        active ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-500 hover:text-gray-900',
      )}
    >
      {children}
    </button>
  );
}

function CalendarPageInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { items: events } = useCollection('events');
  const { items: jobs } = useCollection('jobs');
  const { items: team } = useCollection('team');
  const look = useLookups();

  const [tab, setTab] = useState<CalendarTab>('Sales');
  const [view, setView] = useState<ViewRange>('Month');
  const [dispatch, setDispatch] = useState(false);
  const [current, setCurrent] = useState(() => new Date());
  const [sidebar, setSidebar] = useState(true);

  const staff = useMemo(() => team.filter((t) => t.status !== 'Inactive'), [team]);
  const staffIndex = useMemo(() => staffIndexMap(team), [team]);
  const [selectedStaff, setSelectedStaff] = useState<string[]>(() => staff.map((s) => s.id));
  const [selectedTypes, setSelectedTypes] = useState<string[]>(EVENT_TYPES);
  const [filterOpen, setFilterOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerDate, setPickerDate] = useState(() => new Date());
  const filterRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Modals
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  const [initial, setInitial] = useState<{ date?: string; time?: string }>({});
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const details = events.find((e) => e.id === detailsId) ?? null;

  // ?new=1 opens the schedule form once
  useEffect(() => {
    if (params.get('new') === '1') {
      setInitial({});
      setEditing(null);
      setFormOpen(true);
      router.replace('/calendar', { scroll: false });
    }
  }, [params, router]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setFilterOpen(false);
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPickerOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  /* ----- Items for the active tab, after filters ----- */
  const allItems = useMemo<CalItem[]>(() => {
    if (tab === 'Sales') return events.map(eventToItem);
    return jobs.map((j) => jobToItem(j, look.customer(j.customerId))).filter((x): x is CalItem => !!x);
  }, [tab, events, jobs, look]);

  const filtered = useMemo(() => {
    const allStaff = selectedStaff.length === staff.length;
    return allItems.filter((it) => {
      if (tab === 'Sales' && !selectedTypes.includes(it.type)) return false;
      if (allStaff) return true;
      if (selectedStaff.length === 0) return false;
      if (it.assignees.length === 0) return true; // unassigned stays visible
      return it.assignees.some((a) => selectedStaff.includes(a));
    });
  }, [allItems, selectedStaff, selectedTypes, staff.length, tab]);

  const upcoming = useMemo(() => {
    const todayKey = dayKey(new Date());
    return filtered
      .filter((it) => it.endDate >= todayKey && it.status !== 'Completed')
      .sort((a, b) => (a.startDate + (a.startTime ?? '')).localeCompare(b.startDate + (b.startTime ?? '')))
      .slice(0, 30);
  }, [filtered]);

  /* ----- Navigation ----- */
  const navigate = (dir: number) => {
    const d = new Date(current);
    if (view === 'Month') d.setMonth(d.getMonth() + dir, 1);
    else if (view === 'Week') d.setDate(d.getDate() + dir * 7);
    else d.setDate(d.getDate() + dir);
    setCurrent(d);
  };

  const headerLabel = () => {
    if (view === 'Month') return current.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    if (view === 'Day') return current.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    const w = weekDays(current);
    const a = w[0]!;
    const b = w[6]!;
    return a.getMonth() === b.getMonth()
      ? `${a.toLocaleDateString('en-US', { month: 'long' })} ${a.getDate()} - ${b.getDate()}, ${b.getFullYear()}`
      : `${a.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${b.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  };

  const rangeDays = useMemo(() => {
    if (view === 'Day') return [current];
    if (view === 'Week') return weekDays(current);
    const n = new Date(current.getFullYear(), current.getMonth() + 1, 0).getDate();
    return Array.from({ length: n }, (_, i) => new Date(current.getFullYear(), current.getMonth(), i + 1));
  }, [view, current]);

  /* ----- Actions ----- */
  const openItem = (it: CalItem) => {
    if (it.kind === 'job' && it.job) router.push(`/jobs/${it.job.id}`);
    else if (it.event) setDetailsId(it.event.id);
  };
  const create = (date: string, time?: string) => {
    if (tab !== 'Sales') return; // production work is scheduled from Job Scheduling
    setEditing(null);
    setInitial({ date, time });
    setFormOpen(true);
  };

  const filterLabel =
    selectedStaff.length === staff.length ? 'All Staff'
      : selectedStaff.length === 0 ? 'None'
        : selectedStaff.length === 1 ? fullName(staff.find((s) => s.id === selectedStaff[0])) : `${selectedStaff.length} Selected`;

  /* ----- Mini calendar (date jump) ----- */
  const renderPicker = () => {
    const y = pickerDate.getFullYear();
    const m = pickerDate.getMonth();
    const n = new Date(y, m + 1, 0).getDate();
    const offset = new Date(y, m, 1).getDay();
    const busy = new Set(filtered.map((it) => it.startDate));
    return (
      <div className="absolute left-0 top-full z-50 mt-2 w-72 rounded-2xl border border-gray-200 bg-white p-4 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <button className="rounded p-1 hover:bg-gray-100" onClick={() => setPickerDate(new Date(y, m - 1, 1))} aria-label="Previous month"><ChevronLeft className="h-4 w-4" /></button>
          <span className="text-sm font-bold text-gray-900">{pickerDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>
          <button className="rounded p-1 hover:bg-gray-100" onClick={() => setPickerDate(new Date(y, m + 1, 1))} aria-label="Next month"><ChevronRight className="h-4 w-4" /></button>
        </div>
        <div className="mb-1 grid grid-cols-7 text-center text-xxs font-bold uppercase text-gray-500">
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <span key={i}>{d}</span>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: offset }).map((_, i) => <span key={`b${i}`} />)}
          {Array.from({ length: n }, (_, i) => new Date(y, m, i + 1)).map((d) => (
            <button
              key={d.getDate()}
              onClick={() => {
                setCurrent(d);
                setPickerOpen(false);
              }}
              className={cn(
                'relative flex h-8 items-center justify-center rounded-lg text-xs font-semibold hover:bg-primary-50',
                sameDay(d, current) ? 'bg-primary-600 text-white hover:bg-primary-700' : sameDay(d, new Date()) ? 'text-primary-600' : 'text-gray-700',
              )}
            >
              {d.getDate()}
              {busy.has(dayKey(d)) && <span className="absolute bottom-1 h-1 w-1 rounded-full bg-current" />}
            </button>
          ))}
        </div>
        <button onClick={() => { setCurrent(new Date()); setPickerOpen(false); }} className="mt-3 w-full rounded-lg border border-gray-200 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-50">
          Today
        </button>
      </div>
    );
  };

  return (
    <PageShell title="Calendar" contentClassName="flex min-h-full flex-col px-4 py-8 md:px-8 lg:px-12">
      {/* Header */}
      <div className="mb-8 flex flex-col items-start justify-between gap-6 md:flex-row md:items-end">
        <div className="w-full md:w-auto">
          <h1 className="font-heading text-3xl font-black tracking-tight text-gray-900 md:text-4xl">Calendar</h1>
          <div className="mt-4 flex w-full rounded-xl border border-gray-200 bg-gray-100 p-1 md:w-fit">
            <Seg big active={tab === 'Sales'} onClick={() => setTab('Sales')}><Briefcase className="h-4 w-4" /> Estimates</Seg>
            <Seg big active={tab === 'Production'} onClick={() => setTab('Production')}><Ruler className="h-4 w-4" /> Production</Seg>
          </div>
        </div>

        <div className="flex w-full flex-wrap items-center gap-3 md:w-auto">
          <div className="relative flex-1 md:flex-none" ref={filterRef}>
            <button
              onClick={() => setFilterOpen((o) => !o)}
              className="flex h-12 w-full min-w-[200px] items-center justify-between gap-2 rounded-xl border border-gray-200 bg-white px-4 text-sm font-bold text-gray-700 shadow-sm hover:border-gray-300 md:w-auto"
            >
              <span className="flex items-center gap-2 truncate">
                <Filter className="h-5 w-5 shrink-0 text-gray-500" /> <span className="truncate">Filter: {filterLabel}</span>
              </span>
              <ChevronDown className={cn('h-4 w-4 shrink-0 text-gray-500 transition-transform', filterOpen && 'rotate-180')} />
            </button>
            {filterOpen && (
              <div className="absolute right-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-xl border border-gray-100 bg-white p-2 shadow-xl">
                <div className="mb-1 flex items-center justify-between border-b border-gray-100 px-2 py-1">
                  <span className="text-xs font-bold uppercase text-gray-500">Select Staff</span>
                  <button onClick={() => setSelectedStaff(staff.map((s) => s.id))} className="text-xs font-bold text-primary-600 hover:text-primary-700">Select All</button>
                </div>
                <div className="custom-scrollbar max-h-60 overflow-y-auto">
                  {staff.map((s) => {
                    const on = selectedStaff.includes(s.id);
                    return (
                      <button
                        key={s.id}
                        onClick={() => setSelectedStaff((prev) => (on ? prev.filter((x) => x !== s.id) : [...prev, s.id]))}
                        className={cn('flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm font-medium hover:bg-gray-50', on ? 'text-gray-900' : 'text-gray-500')}
                      >
                        <span className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded border', on ? 'border-primary-600 bg-primary-600' : 'border-gray-300 bg-white')}>
                          {on && <Check className="h-3 w-3 text-white" />}
                        </span>
                        <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', PERSON_SWATCHES[(staffIndex[s.id] ?? 0) % PERSON_SWATCHES.length])} />
                        {fullName(s)}
                      </button>
                    );
                  })}
                </div>
                {tab === 'Sales' && (
                  <>
                    <div className="mb-1 mt-2 border-b border-t border-gray-100 px-2 py-1">
                      <span className="text-xs font-bold uppercase text-gray-500">Event Types</span>
                    </div>
                    {EVENT_TYPES.map((t) => {
                      const on = selectedTypes.includes(t);
                      return (
                        <button
                          key={t}
                          onClick={() => setSelectedTypes((prev) => (on ? prev.filter((x) => x !== t) : [...prev, t]))}
                          className={cn('flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm font-medium hover:bg-gray-50', on ? 'text-gray-900' : 'text-gray-500')}
                        >
                          <span className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded border', on ? 'border-primary-600 bg-primary-600' : 'border-gray-300 bg-white')}>
                            {on && <Check className="h-3 w-3 text-white" />}
                          </span>
                          {t}
                        </button>
                      );
                    })}
                  </>
                )}
              </div>
            )}
          </div>
          {tab === 'Sales' && (
            <Button className="h-12 flex-1 shadow-lg shadow-primary-500/20 md:flex-none" icon={<Plus className="h-4 w-4" />} onClick={() => create(dayKey(new Date()))}>
              Schedule Estimate
            </Button>
          )}
        </div>
      </div>

      {/* Main grid */}
      <div className="relative flex min-h-[680px] flex-1 flex-col gap-6 lg:flex-row">
        <div className="relative flex min-h-[680px] flex-1 flex-col overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm">
          <div className="flex shrink-0 flex-col items-start justify-between gap-4 border-b border-gray-100 p-4 md:p-6 2xl:flex-row 2xl:items-center">
            <div className="flex w-full items-center gap-4 md:w-auto">
              <div className="flex rounded-lg bg-gray-100 p-1">
                <button onClick={() => navigate(-1)} className="rounded-md p-1 text-gray-600 shadow-sm hover:bg-white" aria-label="Previous"><ChevronLeft className="h-5 w-5" /></button>
                <button onClick={() => navigate(1)} className="rounded-md p-1 text-gray-600 shadow-sm hover:bg-white" aria-label="Next"><ChevronRight className="h-5 w-5" /></button>
              </div>
              <div className="relative" ref={pickerRef}>
                <button
                  onClick={() => {
                    setPickerDate(new Date(current));
                    setPickerOpen((o) => !o);
                  }}
                  className="group flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-gray-50"
                >
                  <h2 className="whitespace-nowrap font-heading text-xl font-bold text-gray-900 group-hover:text-primary-600 md:text-2xl">{headerLabel()}</h2>
                  <ChevronDown className={cn('h-5 w-5 text-gray-500 transition-transform group-hover:text-primary-600', pickerOpen && 'rotate-180')} />
                </button>
                {pickerOpen && renderPicker()}
              </div>
            </div>
            <div className="flex w-full items-center gap-4 overflow-x-auto 2xl:w-auto">
              <div className="flex rounded-xl border border-gray-200 bg-gray-100 p-1">
                <Seg active={!dispatch} onClick={() => setDispatch(false)}><CalendarIcon className="h-3.5 w-3.5" /> Calendar</Seg>
                <Seg active={dispatch} onClick={() => setDispatch(true)}><Users className="h-3.5 w-3.5" /> Dispatch</Seg>
              </div>
              <div className="flex rounded-xl border border-gray-200 bg-gray-100 p-1">
                <Seg active={view === 'Month'} onClick={() => setView('Month')}><LayoutGrid className="h-3.5 w-3.5" /> Month</Seg>
                <Seg active={view === 'Week'} onClick={() => setView('Week')}><Columns className="h-3.5 w-3.5" /> Week</Seg>
                <Seg active={view === 'Day'} onClick={() => setView('Day')}><List className="h-3.5 w-3.5" /> Day</Seg>
              </div>
              {!sidebar && (
                <button onClick={() => setSidebar(true)} title="Show Sidebar" aria-label="Show Sidebar" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-500 shadow-sm hover:border-primary-300 hover:text-primary-600">
                  <PanelRight className="h-5 w-5" />
                </button>
              )}
            </div>
          </div>

          {dispatch ? (
            <DispatchView items={filtered} staffIndex={staffIndex} onOpen={openItem} onCreate={create} days={rangeDays} staff={staff.filter((s) => selectedStaff.includes(s.id))} />
          ) : view === 'Month' ? (
            <MonthView items={filtered} staffIndex={staffIndex} onOpen={openItem} onCreate={create} current={current} onShowDay={(d) => { setCurrent(d); setView('Day'); }} />
          ) : (
            <TimeGridView items={filtered} staffIndex={staffIndex} onOpen={openItem} onCreate={create} days={view === 'Week' ? weekDays(current) : [current]} />
          )}
        </div>

        {/* Upcoming sidebar */}
        {sidebar && (
          <div className="flex h-96 w-full shrink-0 flex-col overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm lg:h-auto lg:w-80">
            <div className="flex shrink-0 items-center justify-between border-b border-gray-100 bg-gray-50/50 p-5">
              <h3 className="font-heading text-lg font-bold text-gray-900">{tab === 'Sales' ? 'Upcoming Appointments' : 'Upcoming Work Orders'}</h3>
              <button onClick={() => setSidebar(false)} className="rounded-md p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-600" aria-label="Hide Sidebar" title="Hide Sidebar">
                <PanelRight className="h-5 w-5" />
              </button>
            </div>
            <div className="custom-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
              {upcoming.map((it) => {
                const member = look.member(it.assignees[0]);
                const d = parseDay(it.startDate);
                return (
                  <button
                    key={it.id}
                    onClick={() => openItem(it)}
                    className="group block w-full rounded-xl border border-gray-100 bg-white p-3 text-left transition-all hover:border-primary-300 hover:shadow-md"
                  >
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <div className="line-clamp-1 text-sm font-bold text-gray-900">{it.title}</div>
                      <span className="shrink-0 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-bold text-blue-700">{it.kind === 'job' ? it.status : it.type}</span>
                    </div>
                    <div className="mb-1 flex items-center gap-2 text-xs text-gray-500">
                      <CalendarIcon className="h-3.5 w-3.5" />
                      {d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      {it.kind === 'job' && it.endDate !== it.startDate && ` - ${parseDay(it.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                      {it.startTime && <> &bull; {time12(it.startTime)}</>}
                    </div>
                    {member && (
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <User className="h-3.5 w-3.5" /> {fullName(member)}
                        {it.assignees.length > 1 && ` +${it.assignees.length - 1}`}
                      </div>
                    )}
                  </button>
                );
              })}
              {upcoming.length === 0 && (
                <div className="py-10 text-center text-sm italic text-gray-500">
                  {tab === 'Sales' ? 'No upcoming appointments.' : 'No upcoming work orders.'}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <EventFormModal
        open={formOpen}
        onOpenChange={(o) => {
          setFormOpen(o);
          if (!o) setEditing(null);
        }}
        editing={editing}
        initialDate={initial.date}
        initialTime={initial.time}
      />
      <EventDetailsModal
        event={details}
        onOpenChange={(o) => !o && setDetailsId(null)}
        onEdit={(ev) => {
          setDetailsId(null);
          setEditing(ev);
          setFormOpen(true);
        }}
      />
    </PageShell>
  );
}

export default function CalendarPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50" />}>
      <CalendarPageInner />
    </Suspense>
  );
}

