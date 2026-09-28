/**
 * Cross-Feature Rule 2 — The outstanding demand formula.
 *
 * One formula, used everywhere a quantity balance is shown.
 */

export interface DemandInputs {
  calculated: number;
  reservedShelf: number;
  acknowledged: number;
  confirmedCancellations: number;
  confirmedReturns: number;
  sentUnacknowledged: number;
}

export interface DemandBalance {
  netAcknowledged: number;
  outstanding: number;
  orderableNow: number;
}

export function demandBalance(i: DemandInputs): DemandBalance {
  const netAcknowledged = i.acknowledged - i.confirmedCancellations - i.confirmedReturns;
  const outstanding = i.calculated - i.reservedShelf - netAcknowledged;
  const orderableNow = outstanding - i.sentUnacknowledged;
  return {
    netAcknowledged,
    outstanding: Math.max(0, outstanding),
    orderableNow: Math.max(0, orderableNow),
  };
}
