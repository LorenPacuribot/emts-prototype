'use client';

/*
  Tracked short link (patent 34): /r/{code} records one click (or QR scan with
  ?via=qr) on the marketing link, then opens its page with the UTM tags so the
  lead that follows is credited to the campaign.
*/
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { system } from '@/features/lib/store';
import { useHydrated } from '@/features/lib/hooks';
import { recordLinkClick } from '@/features/lib/store/actions/marketing-growth';
import { deviceFrom, trackedUrl } from '@/features/lib/rules/marketing-growth';

export default function Page() {
  const code = String(useParams<{ code: string }>().code ?? '');
  const hydrated = useHydrated();
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!hydrated) return;
    const via = new URLSearchParams(window.location.search).get('via') === 'qr' ? 'qr' : 'link';
    // One click per visit: a reload of this page is not counted twice.
    const key = `emts-r-${code}-${via}`;
    let clickId = `WEB-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    try {
      clickId = sessionStorage.getItem(key) ?? clickId;
      sessionStorage.setItem(key, clickId);
    } catch {
      /* storage blocked: count the click anyway */
    }
    const r = system(recordLinkClick, code, via, deviceFrom(navigator.userAgent), clickId, document.referrer || undefined);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    window.location.replace(trackedUrl(r.value!.target, r.value!.utm, window.location.origin));
  }, [hydrated, code]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
      <div className="max-w-sm rounded-2xl border border-gray-200 bg-white p-6 text-center shadow-sm">
        {error ? (
          <>
            <h1 className="text-lg font-bold text-gray-900">This link isn&apos;t available</h1>
            <p className="mt-2 text-sm text-gray-600">{error} Please contact Estimate Master Painting directly.</p>
          </>
        ) : (
          <p className="text-sm text-gray-600">Opening…</p>
        )}
      </div>
    </main>
  );
}
