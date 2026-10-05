'use client';

/*
  Runs the automation engine (lib/automations/engine.ts). Mounted once for
  signed-in pages (FeatureShell). It registers what the engine needs from
  the replica (message library, company name, review link, estimate
  templates, names) and ticks every 5 seconds and shortly after any record
  changes. A tick that finds nothing to do changes nothing.
*/
import { useEffect, useRef } from 'react';
import { useStore as useFeatureStore } from '@/features/lib/store';
import { runTick, setEnvironment, useAutomations } from '@/lib/automations/store';
import { useEngineEnv, useNames } from './hooks';

export function AutomationsSync() {
  const env = useEngineEnv();
  const names = useNames();
  const ref = useRef({ env, names });
  ref.current = { env, names };

  useEffect(() => {
    setEnvironment({ env: () => ref.current.env(), names: () => ref.current.names });
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const soon = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        try {
          runTick();
        } catch (e) {
          console.error('Automations tick failed', e);
        }
      }, 400);
    };
    soon();
    const every = setInterval(soon, 5000);
    const unsubF = useFeatureStore.subscribe((st, prev) => { if (st.db !== prev.db) soon(); });
    const unsubA = useAutomations.subscribe((st, prev) => { if (st.s.automations !== prev.s.automations || st.s.readyEstimates !== prev.s.readyEstimates) soon(); });
    return () => {
      clearInterval(every);
      if (timer) clearTimeout(timer);
      unsubF();
      unsubA();
    };
  }, []);

  return null;
}
