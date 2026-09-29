'use client';

/*
  Dropdown menus (Radix). RowMenu is the kebab (⋮) menu used on every card
  and table row in the live app.

  <RowMenu items={[{ label: 'Edit', onClick }, { label: 'Delete', onClick, danger: true }]} />
*/
import React from 'react';
import * as DM from '@radix-ui/react-dropdown-menu';
import { MoreVertical } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface MenuItem {
  label: string;
  onClick: () => void;
  icon?: React.ReactNode;
  danger?: boolean;
  disabled?: boolean;
  separatorBefore?: boolean;
}

export function DropdownMenu({
  trigger, items, align = 'end', className,
}: { trigger: React.ReactNode; items: MenuItem[]; align?: 'start' | 'end' | 'center'; className?: string }) {
  return (
    <DM.Root modal={false}>
      <DM.Trigger asChild>{trigger}</DM.Trigger>
      <DM.Portal>
        <DM.Content
          align={align}
          sideOffset={4}
          className={cn('z-[150] min-w-[180px] rounded-xl border border-gray-200 bg-white p-1 shadow-xl', className)}
          onClick={(e) => e.stopPropagation()}
        >
          {items.map((it, i) => (
            <React.Fragment key={it.label + i}>
              {it.separatorBefore && <DM.Separator className="my-1 h-px bg-gray-100" />}
              <DM.Item
                disabled={it.disabled}
                onSelect={() => it.onClick()}
                className={cn(
                  'flex cursor-pointer select-none items-center gap-2 rounded-lg px-3 py-2 text-sm outline-none',
                  'data-[disabled]:opacity-40 data-[disabled]:cursor-not-allowed',
                  it.danger ? 'text-red-600 data-[highlighted]:bg-red-50' : 'text-gray-700 data-[highlighted]:bg-gray-100',
                )}
              >
                {it.icon && <span className="w-4 h-4 flex items-center [&>svg]:w-4 [&>svg]:h-4">{it.icon}</span>}
                {it.label}
              </DM.Item>
            </React.Fragment>
          ))}
        </DM.Content>
      </DM.Portal>
    </DM.Root>
  );
}

export function RowMenu({ items, className }: { items: MenuItem[]; className?: string }) {
  return (
    <DropdownMenu
      items={items}
      trigger={
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className={cn('rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700', className)}
          aria-label="More actions"
        >
          <MoreVertical className="h-4 w-4" />
        </button>
      }
    />
  );
}
