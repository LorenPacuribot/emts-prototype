'use client';

/*
  Card header used by every dashboard widget: small colored icon, uppercase
  title, and (when the card belongs to a module) a link arrow to that module.
  Matches SectionHeader in the live app.
*/
import React from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export function SectionHeader({
  title, icon: Icon, colorClass = 'text-gray-500', href, right, className,
}: {
  title: string;
  icon: React.ElementType;
  colorClass?: string;
  href?: string;
  right?: React.ReactNode;
  className?: string;
}) {
  const label = (
    <>
      <Icon className={cn('h-4 w-4 shrink-0', colorClass)} />
      <h3 className="text-xs font-black uppercase tracking-[0.15em] text-gray-500 transition-colors group-hover:text-primary-600">{title}</h3>
    </>
  );
  return (
    <div className={cn('mb-4 flex items-center justify-between gap-2 border-b border-gray-100 pb-2', className)}>
      {href ? (
        <Link href={href} className="group flex items-center gap-2" title={`View ${title}`}>
          {label}
          <ArrowRight className="h-3 w-3 text-gray-300 transition-colors group-hover:text-primary-500" />
        </Link>
      ) : (
        <div className="flex items-center gap-2">{label}</div>
      )}
      {right}
    </div>
  );
}

/** Grey pulsing block for loading states. */
export function Pulse({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded bg-gray-100', className)} />;
}

/** Italic grey "nothing here" line used inside cards. */
export function EmptyLine({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn('py-4 text-center text-xs italic text-gray-500', className)}>{children}</p>;
}
