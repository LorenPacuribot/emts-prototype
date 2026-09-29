'use client';

/*
  Calendar views: Month grid, Week/Day time grid and the Dispatch board
  (one row per team member). Structure follows the live calendar template.

  All views are "dumb": they get the already-filtered items and report clicks
  back to the page (open an item, or create a new event at a date/time).
*/
import React, { useEffect, useRef } from 'react';
import { cn, fullName } from '@/lib/utils';
import type { TeamMember } from '@/lib/types';
import {
  PERSON_SWATCHES, colorFor, dayKey, hourLabel, itemOnDay, overlapLayout, sameDay, time12, toMinutes, type CalItem,
} from './utils';

const HOUR_HEIGHT = 64;
const MAX_MONTH_ITEMS = 2;

interface ViewProps {
  items: CalItem[];
  staffIndex: Record<string, number>;
  onOpen: (item: CalItem) => void;
  onCreate: (date: string, time?: string) => void;
}

/** Small colored chip used in month and dispatch cells. */
function Chip({ item, staffIndex, onOpen, showTime = true }: { item: CalItem; staffIndex: Record<string, number>; onOpen: (i: CalItem) => void; showTime?: boolean }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onOpen(item);
      }}
      title={item.title}
      className={cn('mb-1 block w-full truncate rounded border-l-2 px-1.5 py-1 text-left text-xs shadow-sm transition-all hover:brightness-95 md:rounded-lg md:text-xs', colorFor(item, staffIndex))}
    >
      {showTime && item.kind === 'event' && <span className="mr-1 font-bold">{time12(item.startTime)}</span>}
      <span className={cn(item.kind === 'job' && 'font-bold')}>{item.title}</span>
    </button>
  );
}

/* ---------- Month ---------- */

export function MonthView({ items, staffIndex, onOpen, onCreate, current, onShowDay }: ViewProps & { current: Date; onShowDay: (d: Date) => void }) {
  const year = current.getFullYear();
  const month = current.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const offset = new Date(year, month, 1).getDay();
  const today = new Date();
  const cells: (Date | null)[] = [...Array(offset).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1))];
  while (cells.length % 7) cells.push(null);

  return (
    <div className="flex flex-1 flex-col overflow-auto border-b border-gray-200 bg-gray-50">
      <div className="grid min-w-[700px] shrink-0 grid-cols-7 border-b border-gray-200 bg-gray-50">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div key={d} className="py-2 text-center text-xs font-bold uppercase tracking-wider text-gray-500">{d}</div>
        ))}
      </div>
      <div className="grid min-w-[700px] flex-1 grid-cols-7 gap-px bg-gray-200">
        {cells.map((date, i) => {
          if (!date) return <div key={i} className="min-h-[110px] bg-gray-50/30" />;
          const key = dayKey(date);
          const dayItems = items
            .filter((it) => itemOnDay(it, key))
            .sort((a, b) => (a.kind === b.kind ? toMinutes(a.startTime) - toMinutes(b.startTime) : a.kind === 'job' ? -1 : 1));
          return (
            <div
              key={i}
              onClick={() => onCreate(key)}
              className="group relative flex min-h-[110px] cursor-pointer flex-col bg-white p-1 hover:bg-primary-50/20 md:p-2"
              title="Click to schedule"
            >
              <span
                className={cn(
                  'mb-1 flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold md:mb-2 md:h-7 md:w-7 md:text-sm',
                  sameDay(date, today) ? 'bg-primary-600 text-white shadow-md' : 'text-gray-700',
                )}
              >
                {date.getDate()}
              </span>
              <div className="flex-1 space-y-1 overflow-hidden">
                {dayItems.slice(0, MAX_MONTH_ITEMS).map((it) => (
                  <Chip key={it.id} item={it} staffIndex={staffIndex} onOpen={onOpen} />
                ))}
                {dayItems.length > MAX_MONTH_ITEMS && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onShowDay(date);
                    }}
                    className="w-full rounded px-1.5 py-1 text-left text-xs font-bold text-gray-500 hover:bg-gray-50"
                  >
                    + {dayItems.length - MAX_MONTH_ITEMS} more...
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- Week / Day time grid ---------- */

export function TimeGridView({ items, staffIndex, onOpen, onCreate, days }: ViewProps & { days: Date[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const today = new Date();
  const nowMinutes = today.getHours() * 60 + today.getMinutes();
  const cols = days.length;
  const gridCols = cols === 1 ? 'grid-cols-1' : 'grid-cols-7';

  // Start the view at 7 AM, like a normal work day
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 7 * HOUR_HEIGHT;
  }, []);

  const allDay = (key: string) => items.filter((it) => itemOnDay(it, key) && it.kind === 'job');
  const timed = (key: string) => items.filter((it) => itemOnDay(it, key) && it.kind === 'event');
  const hasAllDay = days.some((d) => allDay(dayKey(d)).length > 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white">
      {/* Day headers */}
      <div className="ml-16 flex shrink-0 border-b border-gray-200 bg-gray-50/50 pr-2">
        <div className={cn('grid flex-1 divide-x divide-gray-100', gridCols, cols > 1 && 'min-w-[700px]')}>
          {days.map((d) => (
            <div key={dayKey(d)} className={cn('py-3 text-center', sameDay(d, today) && 'bg-blue-50/50')}>
              <div className={cn('text-xxs font-bold uppercase tracking-wider', sameDay(d, today) ? 'text-primary-600' : 'text-gray-500')}>
                {d.toLocaleDateString('en-US', { weekday: 'short' })}
              </div>
              <div className={cn('text-lg font-bold', sameDay(d, today) ? 'text-primary-600' : 'text-gray-900')}>{d.getDate()}</div>
            </div>
          ))}
        </div>
      </div>

      {/* All-day row: production jobs */}
      {hasAllDay && (
        <div className="flex shrink-0 border-b border-gray-200 pr-2">
          <div className="flex w-16 shrink-0 items-center justify-end pr-2 text-xxs font-bold uppercase text-gray-500">All day</div>
          <div className={cn('grid flex-1 divide-x divide-gray-100', gridCols, cols > 1 && 'min-w-[700px]')}>
            {days.map((d) => (
              <div key={dayKey(d)} className="p-1">
                {allDay(dayKey(d)).map((it) => <Chip key={it.id} item={it} staffIndex={staffIndex} onOpen={onOpen} showTime={false} />)}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Hours */}
      <div ref={scrollRef} className="custom-scrollbar relative h-[620px] overflow-auto">
        <div className="flex" style={{ height: 24 * HOUR_HEIGHT }}>
          <div className="w-16 shrink-0">
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="relative border-b border-transparent" style={{ height: HOUR_HEIGHT }}>
                <span className="absolute -top-2 right-2 text-xs font-bold text-gray-500">{h > 0 ? hourLabel(h) : ''}</span>
              </div>
            ))}
          </div>
          <div className={cn('relative grid flex-1 divide-x divide-gray-100', gridCols, cols > 1 && 'min-w-[700px]')}>
            {days.map((d) => {
              const key = dayKey(d);
              const list = timed(key);
              const layout = overlapLayout(list);
              return (
                <div key={key} className={cn('relative', sameDay(d, today) && 'bg-blue-50/20')}>
                  {Array.from({ length: 24 }, (_, h) => (
                    <div
                      key={h}
                      onClick={() => onCreate(key, `${String(h).padStart(2, '0')}:00`)}
                      className="cursor-pointer border-b border-gray-100 hover:bg-primary-50/40"
                      style={{ height: HOUR_HEIGHT }}
                      title={`Schedule at ${hourLabel(h)}`}
                    />
                  ))}
                  {list.map((it) => {
                    const start = toMinutes(it.startTime);
                    const end = Math.max(toMinutes(it.endTime), start + 20);
                    const pos = layout[it.id] ?? { col: 0, cols: 1 };
                    return (
                      <button
                        key={it.id}
                        type="button"
                        onClick={() => onOpen(it)}
                        className={cn('absolute overflow-hidden rounded-lg border-l-4 px-2 py-1 text-left text-xs shadow-sm hover:z-10 hover:shadow-md', colorFor(it, staffIndex))}
                        style={{
                          top: (start / 60) * HOUR_HEIGHT,
                          height: ((end - start) / 60) * HOUR_HEIGHT - 2,
                          left: `calc(${(pos.col / pos.cols) * 100}% + 2px)`,
                          width: `calc(${100 / pos.cols}% - 4px)`,
                        }}
                      >
                        <div className="truncate font-bold">{it.title}</div>
                        <div className="truncate text-xs opacity-75">{time12(it.startTime)} - {time12(it.endTime)}</div>
                      </button>
                    );
                  })}
                  {sameDay(d, today) && (
                    <div className="pointer-events-none absolute left-0 right-0 z-20 flex items-center" style={{ top: (nowMinutes / 60) * HOUR_HEIGHT }}>
                      <div className="-ml-1 h-2 w-2 rounded-full bg-red-500" aria-hidden />
                      <div className="h-px flex-1 bg-red-500" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- Dispatch (staff x days) ---------- */

export function DispatchView({ items, staffIndex, onOpen, onCreate, days, staff }: ViewProps & { days: Date[]; staff: TeamMember[] }) {
  const today = new Date();
  const colWidth = days.length === 1 ? 'min-w-[240px]' : days.length <= 7 ? 'min-w-[160px]' : 'min-w-[140px]';
  const unassigned = items.filter((it) => it.assignees.length === 0);
  const rows: { id: string; name: string; role: string; list: CalItem[] }[] = [
    ...staff.map((s) => ({ id: s.id, name: fullName(s), role: s.role, list: items.filter((it) => it.assignees.includes(s.id)) })),
    ...(unassigned.length ? [{ id: '_none', name: 'Unassigned', role: '', list: unassigned }] : []),
  ];
  return (
    <div className="custom-scrollbar flex-1 overflow-auto">
      <table className="w-full border-collapse text-left">
        <thead className="sticky top-0 z-10 bg-gray-50">
          <tr>
            <th className="sticky left-0 z-20 min-w-[180px] border-b border-r border-gray-200 bg-gray-50 px-4 py-3 text-xs font-bold uppercase tracking-wider text-gray-500">Employee</th>
            {days.map((d) => (
              <th key={dayKey(d)} className={cn('border-b border-r border-gray-100 px-3 py-2 text-center', colWidth, sameDay(d, today) && 'bg-blue-50/60')}>
                <div className="text-xxs font-bold uppercase tracking-wider text-gray-500">{d.toLocaleDateString('en-US', { weekday: 'short' })}</div>
                <div className="text-sm font-bold text-gray-900">{d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
                {sameDay(d, today) && <div className="mt-1 text-xs text-primary-600">Today</div>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="align-top">
              <td className="sticky left-0 z-10 border-b border-r border-gray-200 bg-white px-4 py-3">
                <div className="flex items-center gap-2">
                  {row.id !== '_none' && <span className={cn('h-2.5 w-2.5 rounded-full', PERSON_SWATCHES[(staffIndex[row.id] ?? 0) % PERSON_SWATCHES.length])} />}
                  <div>
                    <div className="text-sm font-bold text-gray-900">{row.name}</div>
                    {row.role && <div className="text-xs text-gray-500">{row.role}</div>}
                  </div>
                </div>
              </td>
              {days.map((d) => {
                const key = dayKey(d);
                const cell = row.list.filter((it) => itemOnDay(it, key));
                return (
                  <td
                    key={key}
                    onClick={() => onCreate(key)}
                    className={cn('h-16 cursor-pointer border-b border-r border-gray-100 p-1.5 hover:bg-primary-50/30', sameDay(d, today) && 'bg-blue-50/20')}
                  >
                    {cell.slice(0, 3).map((it) => <Chip key={it.id} item={it} staffIndex={staffIndex} onOpen={onOpen} />)}
                    {cell.length > 3 && <div className="px-1 text-xs font-bold text-gray-500">+ {cell.length - 3} more</div>}
                  </td>
                );
              })}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={days.length + 1} className="px-6 py-12 text-center text-sm italic text-gray-500">No staff selected.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
