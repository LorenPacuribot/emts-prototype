import type { KeyboardEvent } from 'react';

/**
 * Props that make a clickable div, card or table row work from the keyboard
 * (A5): it can be reached with Tab, and Enter or Space runs its onClick.
 * Rows keep their table role, and other elements get role="button". Keys
 * pressed inside a nested button or field are left alone. Pass a falsy
 * `enabled` when the element is only sometimes clickable.
 */
export function pressable(enabled: unknown = true, { row = false }: { row?: boolean } = {}) {
  if (!enabled) return {};
  return {
    ...(row ? {} : { role: 'button' as const }),
    tabIndex: 0,
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      if (e.target !== e.currentTarget) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.currentTarget.click();
      }
    },
  };
}
