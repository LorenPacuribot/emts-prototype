'use client';

/* Settings > Difficulty Tiers. Height and access multipliers (see TiersPanel). */
import { SettingsPage } from '@/components/settings/SettingsSidebar';
import { TiersPanel } from './TiersPanel';
import { SettingsCard } from './ui';

export function DifficultyTiersView() {
  return (
    <SettingsPage title="Difficulty Tiers" subtitle="Configure pricing multipliers for different difficulty levels.">
      <SettingsCard>
        <TiersPanel />
      </SettingsCard>
    </SettingsPage>
  );
}
