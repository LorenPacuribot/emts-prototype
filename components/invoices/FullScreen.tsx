'use client';

/*
  Full-screen frame for customer-facing and printable pages (invoice preview,
  invoice pay page). It covers the app sidebar so the page looks like the live
  public pages, and adds print CSS so only the ".print-area" content prints.
*/
import React from 'react';
import { cn } from '@/lib/utils';

export function FullScreen({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('fixed inset-0 z-[60] overflow-y-auto bg-gray-100 print:static print:overflow-visible print:bg-white', className)}>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .print-area, .print-area * { visibility: visible; }
          .print-area { position: absolute; left: 0; top: 0; width: 100%; }
          @page { margin: 0.4in; }
        }
      `}</style>
      {children}
    </div>
  );
}
