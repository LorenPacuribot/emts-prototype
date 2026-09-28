'use client';

/*
  Keeps the few settings the new features read in step with the replica's
  own settings singletons (the replica pages are the UI):
    generalConfig.calculateWaste / defaultWastePercent -> db.wasteSettings        (feature 18)
    financialSettings.depositPercent / misc margin      -> db.financialSettings    (feature 33: deposit invoice on acceptance)
  Edits made on the settings pages go through the prototype actions first
  (access check + activity log) and then update the replica singleton; this
  component only mirrors values that drifted (first load, demo reset,
  rehydration), like lib/bridge does for records. Renders nothing.
*/
import { useEffect } from 'react';
import { produce } from 'immer';
import { useSingleton } from '@/lib/store';
import { useDb, useStore as useFeatureStore } from '@/features/lib/store';
import { financialSettings as protoFinancial, wasteSettings as protoWaste } from '@/features/lib/store/actions/settings';

export function FeatureSettingsSync() {
  const [cfg] = useSingleton('generalConfig');
  const [fin] = useSingleton('financialSettings');
  const pWaste = useDb((d) => d.wasteSettings);
  const pFin = useDb((d) => d.financialSettings);

  useEffect(() => {
    const cur = protoWaste(useFeatureStore.getState().db);
    if (pWaste && cur.calculateWaste === cfg.calculateWaste && cur.defaultWastePercent === cfg.defaultWastePercent) return;
    useFeatureStore.setState((s) => ({
      db: produce(s.db, (d) => {
        d.wasteSettings = { ...protoWaste(d), calculateWaste: cfg.calculateWaste, defaultWastePercent: cfg.defaultWastePercent };
      }),
    }));
  }, [pWaste, cfg.calculateWaste, cfg.defaultWastePercent]);

  useEffect(() => {
    const cur = protoFinancial(useFeatureStore.getState().db);
    if (
      pFin &&
      cur.depositPercent === fin.depositPercent &&
      cur.applyProfitToMiscLineItems === fin.applyProfitToMiscLineItems &&
      cur.miscLineItemProfitMargin === fin.miscLineItemProfitMargin
    ) return;
    useFeatureStore.setState((s) => ({
      db: produce(s.db, (d) => {
        d.financialSettings = {
          ...protoFinancial(d),
          depositPercent: fin.depositPercent,
          applyProfitToMiscLineItems: fin.applyProfitToMiscLineItems,
          miscLineItemProfitMargin: fin.miscLineItemProfitMargin,
        };
      }),
    }));
  }, [pFin, fin.depositPercent, fin.applyProfitToMiscLineItems, fin.miscLineItemProfitMargin]);

  return null;
}
