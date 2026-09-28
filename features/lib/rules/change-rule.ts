/**
 * Cross-Feature Rule 1 — The signed-scope change rule.
 *
 * Given a before/after product selection on a job, decide which document
 * the change needs. Used by features 3, 19, 24 and 28.
 */

export interface Selection {
  brand: string;
  productLine: string;
  colour: string; // colour number
  sheen: string;
  product: string;
  packSize?: string;
  costPerGal: number;
}

export type ChangeDecision =
  | { kind: "no_change" }
  | { kind: "draft_edit"; reason: string }
  | { kind: "office_approval"; reason: string }
  | { kind: "colour_reapproval"; reason: string }
  | { kind: "change_order"; reason: string };

export interface ChangeContext {
  jobSigned: boolean;
  /** Any affected paint already tinted or ordered. */
  tintedOrOrdered: boolean;
  /** Price of the job changes because of this change. */
  priceChanges: boolean;
  /** The new product is a manufacturer-published direct successor. */
  isDirectSuccessor?: boolean;
}

export function classifyChange(before: Selection, after: Selection, ctx: ChangeContext): ChangeDecision {
  const brandChanged = before.brand !== after.brand;
  const lineChanged = before.productLine !== after.productLine;
  const colourChanged = before.colour !== after.colour;
  const sheenChanged = before.sheen !== after.sheen;
  const productChanged = before.product !== after.product;
  const packChanged = before.packSize !== after.packSize;

  if (!brandChanged && !lineChanged && !colourChanged && !sheenChanged && !productChanged && !packChanged) {
    return { kind: "no_change" };
  }

  if (!ctx.jobSigned) {
    return { kind: "draft_edit", reason: "Job is not signed. Amend the estimate instead of raising a change order." };
  }

  // Colour Re-approval: narrow exception. Only colour changes, no price change,
  // nothing tinted or ordered, brand / line / sheen unchanged. Never widened.
  if (colourChanged && !brandChanged && !lineChanged && !sheenChanged && !ctx.priceChanges && !ctx.tintedOrOrdered) {
    return {
      kind: "colour_reapproval",
      reason: "Colour-only change with no price change and nothing tinted or ordered. A separately numbered Colour Re-approval record is enough.",
    };
  }

  if (brandChanged || lineChanged || colourChanged || sheenChanged) {
    const what = [
      brandChanged && "brand",
      lineChanged && "product line",
      colourChanged && "colour",
      sheenChanged && "sheen",
    ]
      .filter(Boolean)
      .join(", ");
    return {
      kind: "change_order",
      reason: `Change of ${what} on a signed job needs a priced change order with the customer's signature, even at zero price.`,
    };
  }

  // Same brand, line, colour and sheen: pack size or direct successor only.
  const costDelta = before.costPerGal === 0 ? 0 : Math.abs(after.costPerGal - before.costPerGal) / before.costPerGal;
  const onlyPackOrSuccessor = packChanged || (productChanged && ctx.isDirectSuccessor);
  if (onlyPackOrSuccessor && costDelta <= 0.1) {
    return { kind: "office_approval", reason: "Pack size or direct successor within 10% cost. The office manager approves alone." };
  }

  return {
    kind: "change_order",
    reason: productChanged && !ctx.isDirectSuccessor
      ? "Product change that is not a published direct successor needs a priced change order."
      : "Cost change above 10% needs a priced change order.",
  };
}
