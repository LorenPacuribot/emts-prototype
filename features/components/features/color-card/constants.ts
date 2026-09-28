import type { Sheen } from "@/features/types";
import { PRIMER_NONE_SOUND } from "@/features/types";

export const SHEENS: Sheen[] = ["Flat", "Matte", "Eggshell", "Satin", "Semi-Gloss", "Gloss"];

export const PRIMERS = [
  PRIMER_NONE_SOUND,
  "Spot prime bare wood — Exterior Latex Wood Primer",
  "Full prime — Multi-Purpose Latex Primer",
  "Bonding primer — Extreme Bond",
  "Stain-blocking primer — PrepRite ProBlock",
];

export const COAT_STEPS = ["Patch & sand", "Degloss & clean", "Spot prime bare wood", "Bonding primer", "Full prime", "Finish coat 1", "Finish coat 2", "Finish coat 3"];

export const MANUFACTURERS = ["Sherwin-Williams", "Benjamin Moore", "Behr", "PPG"];

export const TINT_BASES = ["Extra White base", "Deep base", "Ultradeep base", "Pastel base"];

export const CHANNEL_LABEL = { estimate_pdf: "Estimate PDF signature", email: "Email", portal: "Customer portal" } as const;
