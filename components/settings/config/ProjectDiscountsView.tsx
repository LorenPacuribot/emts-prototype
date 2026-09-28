'use client';

/* Settings > Project Discounts. Promotional or situational discounts (see DiscountsPanel). */
import { SettingsPage } from '@/components/settings/SettingsSidebar';
import { DiscountsPanel } from './DiscountsPanel';

export function ProjectDiscountsView() {
  return (
    <SettingsPage title="Project Discounts" subtitle="Manage promotional or situational discounts for your estimates.">
      <DiscountsPanel title="Discounts" />
    </SettingsPage>
  );
}
