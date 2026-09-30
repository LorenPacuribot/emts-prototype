'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { loadRemoteState, onRemoteChange, type RemoteChange, type RemoteStatus } from '@/lib/remote-state';
import { describeConflict } from '@/lib/json-merge';
import { reloadTombstones } from '@/lib/bridge/sync';
import { STORAGE_KEY as FEATURE_KEY, useStore as useFeatureStore } from '@/features/lib/store';

// One load per page, even when Strict Mode runs effects twice.
let loading: Promise<RemoteStatus> | undefined;

async function start(): Promise<RemoteStatus> {
  const status = await loadRemoteState();
  // The feature store read localStorage when its module loaded; read it again now.
  if (status === 'shared') {
    await useFeatureStore.persist.rehydrate();
    // Persist writes on every set; this uploads it when the shared copy lacks it (no-op otherwise).
    useFeatureStore.setState({});
  }
  return status;
}

const OFFLINE_TEXT = 'Shared data is unavailable. Changes are saved in this browser only.';

/**
 * The offline notice's place. A page header (AppHeader) claims it and shows a
 * slim bar under itself; pages without one (customer links) keep the small
 * floating notice. Same condition and text either way.
 */
const SyncStatusContext = createContext<{ offline: boolean; claimBar: () => () => void }>({ offline: false, claimBar: () => () => undefined });

/** The offline notice as a full-width bar under the page header. */
export function SyncStatusBar() {
  const { offline, claimBar } = useContext(SyncStatusContext);
  useEffect(() => claimBar(), [claimBar]);
  if (!offline) return null;
  return (
    <div role="status" className="flex min-h-10 shrink-0 items-center justify-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm text-amber-800 print:hidden">
      <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
      {OFFLINE_TEXT}
    </div>
  );
}

export function RemoteStateGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<RemoteStatus>();
  const [notice, setNotice] = useState<{ conflicts: string[] }>();
  const [bars, setBars] = useState(0);
  const claimBar = useCallback(() => {
    setBars((n) => n + 1);
    return () => setBars((n) => n - 1);
  }, []);
  const sync = useMemo(() => ({ offline: status === 'offline', claimBar }), [status, claimBar]);

  useEffect(() => {
    loading ??= start();
    void loading.then(setStatus);
  }, []);

  // Someone else saved: reload the affected store (the replica store listens itself).
  useEffect(
    () =>
      onRemoteChange((c: RemoteChange) => {
        if (c.key === FEATURE_KEY) void useFeatureStore.persist.rehydrate();
        if (c.key === 'emts-bridge-tombstones-v2') reloadTombstones();
        if (c.merged) setNotice((n) => ({ conflicts: [...new Set([...(n?.conflicts ?? []), ...c.conflicts])] }));
      }),
    [],
  );

  if (!status) return <div className="min-h-screen bg-gray-50" />;
  const clashes = notice ? [...new Set(notice.conflicts.map(describeConflict))] : [];
  return (
    <SyncStatusContext.Provider value={sync}>
      {children}
      {status === 'offline' && bars === 0 && (
        <div role="status" className="fixed bottom-3 left-1/2 z-[100] -translate-x-1/2 rounded-full bg-amber-100 px-4 py-1.5 text-xs font-medium text-amber-900 shadow">
          {OFFLINE_TEXT}
        </div>
      )}
      {notice && (
        <div role="alert" className="fixed bottom-3 left-1/2 z-[100] w-[min(36rem,calc(100%-2rem))] -translate-x-1/2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-lg">
          <p className="font-semibold">Someone else saved changes at the same time.</p>
          {clashes.length === 0 ? (
            <p className="mt-1">Their changes and yours were combined. Nothing was lost.</p>
          ) : (
            <p className="mt-1">
              Their changes and yours were combined, but you both changed the same {clashes.length === 1 ? 'item' : 'items'}, so their version was kept for:{' '}
              <span className="font-medium">{clashes.slice(0, 5).join(', ')}{clashes.length > 5 ? ` and ${clashes.length - 5} more` : ''}</span>. Check {clashes.length === 1 ? 'it' : 'them'} and redo your change if it is still needed.
            </p>
          )}
          <div className="mt-2 text-right">
            <button type="button" onClick={() => setNotice(undefined)} className="min-h-[44px] rounded-lg px-3 font-semibold text-amber-900 hover:bg-amber-100">
              Got it
            </button>
          </div>
        </div>
      )}
    </SyncStatusContext.Provider>
  );
}
