/**
 * Live settings pages rebuilt for the new features.
 *
 *   updateWasteSettings      PATCH /master-data/pricing/waste-settings        (General Configuration)
 *   updateFinancialSettings  PATCH /master-data/pricing/financial-settings    (Financial Settings)
 */
import type { Database, User } from "@/features/types";
import { can, whoCan } from "@/features/lib/permissions";
import { now } from "@/features/lib/clock";
import { DEFAULT_DEPOSIT_PERCENT } from "@/features/lib/rules/estimate-lifecycle";
import { denied, fail, log, ok } from "../helpers";

const MODULE = "Settings";

export function wasteSettings(db: Database) {
  return db.wasteSettings ?? { calculateWaste: true, defaultWastePercent: 10 };
}

export function financialSettings(db: Database) {
  return db.financialSettings ?? { applyProfitToMiscLineItems: false, miscLineItemProfitMargin: 20, depositPercent: DEFAULT_DEPOSIT_PERCENT };
}

export function updateWasteSettings(db: Database, actor: User, patch: { calculateWaste?: boolean; defaultWastePercent?: number }) {
  if (!can(actor, "settings.masterData")) return denied(db, actor, MODULE, "change waste settings", whoCan("settings.masterData"));
  if (patch.defaultWastePercent !== undefined && !(patch.defaultWastePercent >= 0 && patch.defaultWastePercent <= 50)) return fail("Waste Percentage must be between 0 and 50.", "defaultWastePercent");
  db.wasteSettings = { ...wasteSettings(db), ...patch, updatedAt: now(), updatedBy: actor.id };
  log(db, actor, MODULE, `Waste settings changed by ${actor.name}: ${JSON.stringify(patch)}`);
  return ok();
}

export function updateFinancialSettings(db: Database, actor: User, patch: { applyProfitToMiscLineItems?: boolean; miscLineItemProfitMargin?: number; depositPercent?: number }) {
  if (!can(actor, "settings.masterData")) return denied(db, actor, MODULE, "change financial settings", whoCan("settings.masterData"));
  if (patch.depositPercent !== undefined && !(patch.depositPercent >= 0 && patch.depositPercent <= 100)) return fail("Deposit Percentage must be between 0 and 100.", "depositPercent");
  if (patch.miscLineItemProfitMargin !== undefined && !(patch.miscLineItemProfitMargin >= 0 && patch.miscLineItemProfitMargin < 100)) return fail("Margin must be between 0 and 99.", "miscLineItemProfitMargin");
  db.financialSettings = { ...financialSettings(db), ...patch, updatedAt: now(), updatedBy: actor.id };
  log(db, actor, MODULE, `Financial settings changed by ${actor.name}: ${JSON.stringify(patch)}`);
  return ok();
}
