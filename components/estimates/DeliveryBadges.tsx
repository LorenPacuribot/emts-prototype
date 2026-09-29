'use client';

/*
  Shows what happened to the latest "Send to Customer" (Estimate.deliveries):
  "Emailed to x@y.com · Delivered 3:42 pm", "Sandbox — not really sent...",
  or "Failed: <reason>" with a Retry button. Each badge has an icon and text,
  so the state never relies on colour alone.
*/
import React from 'react';
import { AlertTriangle, CheckCircle2, FlaskConical, RotateCw } from 'lucide-react';
import type { Estimate, EstimateDelivery } from '@/lib/types';
import { cn } from '@/lib/utils';
import { deliveryText, latestDeliveries } from '@/lib/estimate-email';

const STYLE: Record<EstimateDelivery['status'], string> = {
  delivered: 'border-green-200 bg-green-50 text-green-800',
  sandbox: 'border-amber-200 bg-amber-50 text-amber-800',
  failed: 'border-red-200 bg-red-50 text-red-800',
};
const ICON = { delivered: CheckCircle2, sandbox: FlaskConical, failed: AlertTriangle } as const;
const TITLE: Record<EstimateDelivery['status'], string> = {
  delivered: 'The email provider accepted the message for delivery.',
  sandbox: 'The server has no email keys (MESSAGING_EMAIL_ENDPOINT_URL, MESSAGING_EMAIL_API_KEY, MESSAGING_FROM_EMAIL), so the message was only recorded.',
  failed: 'The message was not sent. The estimate keeps its status until a send succeeds.',
};

export function DeliveryBadges({ estimate, onRetry, retrying, className }: { estimate: Pick<Estimate, 'deliveries'>; onRetry?: () => void; retrying?: boolean; className?: string }) {
  const latest = latestDeliveries(estimate);
  if (!latest.length) return null;
  const anyFailed = latest.some((d) => d.status === 'failed');
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)} role="status" aria-live="polite">
      {latest.map((d) => {
        const Icon = ICON[d.status];
        return (
          <span key={d.id} title={`${TITLE[d.status]}${d.providerMessageId ? ` Message id: ${d.providerMessageId}` : ''}`} className={cn('inline-flex max-w-full items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold', STYLE[d.status])}>
            <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="min-w-0 break-words">{deliveryText(d)}</span>
          </span>
        );
      })}
      {anyFailed && onRetry && (
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RotateCw className={cn('h-3.5 w-3.5', retrying && 'animate-spin')} aria-hidden /> {retrying ? 'Retrying…' : 'Retry'}
        </button>
      )}
    </div>
  );
}
