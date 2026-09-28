'use client';

/*
  Runs the bridge (lib/bridge/sync.ts) whenever either store changes:
  after every replica store update, and on every feature-store update.
  Replica changes from one run are sent as a single 'bridge' action.
*/
import { useEffect, useRef } from 'react';
import { useStore as useFeatureStore } from '@/features/lib/store';
import { useStoreInternals } from '@/lib/store';
import { runSync } from './sync';

export function BridgeSync() {
  const { db, dispatch } = useStoreInternals();
  const latest = useRef(db);
  const state = useRef({ running: false, again: false, awaitingReplica: false, burst: 0, burstStart: 0 });
  latest.current = db;

  const run = useRef(() => {});
  run.current = () => {
    const s = state.current;
    if (s.running) {
      s.again = true;
      return;
    }
    // Loop guard: a sync that keeps producing changes is a bug, not a user action.
    const t = Date.now();
    if (t - s.burstStart > 2000) {
      s.burstStart = t;
      s.burst = 0;
    }
    if (++s.burst > 40) {
      if (s.burst === 41) console.warn('[bridge] sync stopped: too many consecutive changes');
      return;
    }
    s.running = true;
    try {
      const ops = runSync(latest.current);
      if (ops.length) {
        s.awaitingReplica = true;
        dispatch({ type: 'bridge', ops });
      }
    } catch (err) {
      console.error('[bridge] sync failed', err);
    } finally {
      s.running = false;
    }
    if (s.again) {
      s.again = false;
      if (!s.awaitingReplica) queueMicrotask(() => run.current());
    }
  };

  // Every replica change (including the ops we just sent).
  useEffect(() => {
    state.current.awaitingReplica = false;
    run.current();
  }, [db]);

  // Every feature-store change. Wait for pending replica ops to land first.
  useEffect(
    () =>
      useFeatureStore.subscribe((s, prev) => {
        if (s.db === prev.db && s.currentUserId === prev.currentUserId) return;
        if (state.current.awaitingReplica || state.current.running) {
          state.current.again = true;
          return;
        }
        queueMicrotask(() => run.current());
      }),
    [],
  );

  return null;
}
