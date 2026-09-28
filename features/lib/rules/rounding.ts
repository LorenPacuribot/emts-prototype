/**
 * Cross-Feature Rule 6 — Rounding and precision.
 *
 * Money rounds to cents, half-up. Quantities keep full precision and are
 * rounded once, at the end. Never feed a displayed value back into a sum.
 */

/** Half-up rounding to a number of decimals, safe against float noise. */
export function roundHalfUp(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  // Add a tiny epsilon scaled to the value so 1.005 rounds to 1.01.
  const shifted = value * factor;
  const rounded = Math.sign(shifted) * Math.round(Math.abs(shifted) + 1e-9);
  return rounded / factor;
}

export const roundMoney = (value: number) => roundHalfUp(value, 2);
