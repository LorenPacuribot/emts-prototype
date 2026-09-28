'use client';

/*
  Lightweight toasts (top-center, like the live app's Sonner setup).
  const { toast } = useToast(); toast('Lead saved'); toast('Failed', 'error');
*/
import React, { createContext, useCallback, useContext, useState } from 'react';
import { CheckCircle2, Info, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

type Variant = 'success' | 'error' | 'info';
interface ToastItem { id: number; message: string; variant: Variant }

const ToastContext = createContext<{ toast: (message: string, variant?: Variant) => void }>({ toast: () => {} });

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const toast = useCallback((message: string, variant: Variant = 'success') => {
    const id = Date.now() + Math.random();
    setItems((s) => [...s, { id, message, variant }]);
    setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), 3200);
  }, []);
  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="pointer-events-none fixed left-1/2 top-4 z-[300] flex -translate-x-1/2 flex-col items-center gap-2">
        {items.map((t) => (
          <div
            key={t.id}
            role="status"
            className={cn(
              'pointer-events-auto flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium shadow-lg',
              t.variant === 'success' && 'border-green-200 bg-green-50 text-green-800',
              t.variant === 'error' && 'border-red-200 bg-red-50 text-red-800',
              t.variant === 'info' && 'border-blue-200 bg-blue-50 text-blue-800',
            )}
          >
            {t.variant === 'success' && <CheckCircle2 className="h-4 w-4" />}
            {t.variant === 'error' && <XCircle className="h-4 w-4" />}
            {t.variant === 'info' && <Info className="h-4 w-4" />}
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
