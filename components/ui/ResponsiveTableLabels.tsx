'use client';

import { useEffect } from 'react';

/**
 * Labels the cells of every responsive table (a table directly inside an
 * element with the `rtable` class, see app/globals.css) with its column
 * header, so the phone card layout can show "Status", "Due" and so on beside
 * each value (H8). Mounted once in the root layout; it re-runs when the page
 * changes, so hand-built tables only need the class on their wrapper.
 * A wrapper that scrolls sideways also gets tabindex="0", so keyboard users
 * can reach it and scroll it with the arrow keys.
 */
export function labelResponsiveTables(root: ParentNode = document) {
  for (const wrap of Array.from(root.querySelectorAll<HTMLElement>('.rtable'))) {
    const scrolls = wrap.scrollWidth > wrap.clientWidth + 1;
    if (scrolls && !wrap.hasAttribute('tabindex')) {
      wrap.setAttribute('tabindex', '0');
      wrap.dataset.scrollFocus = '';
    } else if (!scrolls && wrap.dataset.scrollFocus !== undefined) {
      wrap.removeAttribute('tabindex');
      delete wrap.dataset.scrollFocus;
    }
  }
  for (const table of Array.from(root.querySelectorAll<HTMLTableElement>('.rtable > table'))) {
    const heads = Array.from(table.querySelectorAll(':scope > thead > tr:last-child > th')).map((th) => th.textContent?.trim() ?? '');
    for (const tr of Array.from(table.querySelectorAll(':scope > tbody > tr'))) {
      let col = 0;
      for (const td of Array.from(tr.children) as HTMLTableCellElement[]) {
        const span = td.colSpan || 1;
        const label = span === 1 ? heads[col] ?? '' : '';
        if (td.getAttribute('data-label') !== label) td.setAttribute('data-label', label);
        col += span;
      }
    }
  }
}

export function ResponsiveTableLabels() {
  useEffect(() => {
    let frame = 0;
    const run = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => labelResponsiveTables());
    };
    run();
    // Only structural changes matter; our own data-label writes are attributes, so they don't loop.
    const observer = new MutationObserver(run);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    window.addEventListener('resize', run);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', run);
    };
  }, []);
  return null;
}
