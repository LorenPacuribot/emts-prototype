'use client';

/*
  Prints only the proposal, not the app.

  Why: the app layout is a fixed-height, scrolling frame, so printing it
  directly would cut the document off after one page. This portal renders a
  second copy of the document straight under <body>. While mounted, it adds
  print-only classes to <body> that hide every other child, so the browser
  prints just this copy at full length. On screen the copy stays hidden.
*/
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

const BODY_CLASSES = ['print:[&>*]:hidden', 'print:[&>#estimate-print-root]:block', 'print:bg-white'];

export function PrintPortal({ children }: { children: React.ReactNode }) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setEl(document.body);
    document.body.classList.add(...BODY_CLASSES);
    return () => document.body.classList.remove(...BODY_CLASSES);
  }, []);
  if (!el) return null;
  return createPortal(
    <div id="estimate-print-root" className="hidden bg-white print:block">
      {children}
    </div>,
    el,
  );
}
