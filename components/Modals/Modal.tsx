'use client';

/*
  Modal and ConfirmDialog, built on Radix Dialog.
  <Modal open onOpenChange title="Add Lead" footer={<Button>Save</Button>}>…</Modal>
*/
import React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { AlertTriangle, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

const SIZES = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl', full: 'max-w-6xl' } as const;

export function Modal({
  open, onOpenChange, title, description, children, footer, size = 'md', className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[100] bg-gray-900/40 backdrop-blur-[2px]" />
        <Dialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-[101] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2',
            'max-h-[90vh] flex flex-col rounded-2xl bg-white shadow-2xl border border-gray-100 focus:outline-none',
            SIZES[size],
            className,
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-6 py-4">
            <div>
              <Dialog.Title className="font-heading text-lg font-bold text-gray-900">{title}</Dialog.Title>
              {description ? (
                <Dialog.Description className="mt-0.5 text-sm text-gray-500">{description}</Dialog.Description>
              ) : (
                <Dialog.Description className="sr-only">{typeof title === 'string' ? title : 'Dialog'}</Dialog.Description>
              )}
            </div>
            <Dialog.Close className="rounded-full p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700" aria-label="Close">
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
          {footer && <div className="flex items-center justify-end gap-2 border-t border-gray-100 bg-gray-50/60 px-6 py-3 rounded-b-2xl">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function ConfirmDialog({
  open, onOpenChange, title = 'Are you sure?', message, confirmLabel = 'Delete', onConfirm, variant = 'danger',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  message?: React.ReactNode;
  confirmLabel?: string;
  onConfirm: () => void;
  variant?: 'danger' | 'primary';
}) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      size="sm"
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant={variant}
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex gap-3">
        {variant === 'danger' && (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50">
            <AlertTriangle className="h-5 w-5 text-red-600" />
          </div>
        )}
        <div className="text-sm text-gray-600">{message ?? 'This action cannot be undone.'}</div>
      </div>
    </Modal>
  );
}
