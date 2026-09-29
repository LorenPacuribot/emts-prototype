'use client';

import { useEffect, useState } from 'react';
import { loadRemoteState, type RemoteStatus } from '@/lib/remote-state';
import { useStore as useFeatureStore } from '@/features/lib/store';

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

export function RemoteStateGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<RemoteStatus>();

  useEffect(() => {
    loading ??= start();
    void loading.then(setStatus);
  }, []);

  if (!status) return <div className="min-h-screen bg-gray-50" />;
  return (
    <>
      {children}
      {status === 'offline' && (
        <div role="status" className="fixed bottom-3 left-1/2 z-[100] -translate-x-1/2 rounded-full bg-amber-100 px-4 py-1.5 text-xs font-medium text-amber-900 shadow">
          Shared data is unavailable. Changes are saved in this browser only.
        </div>
      )}
    </>
  );
}
