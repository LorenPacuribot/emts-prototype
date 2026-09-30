"use client";
import { createContext, useContext } from "react";

/**
 * "Roomy" layout: the calmer look first built for Time and Payroll (big stat
 * cards, 40px filter chips, 15px tables, real section titles). A module frame
 * turns it on for its screens (Screen `roomy`); everything else in the app
 * keeps the compact look. Drawers and modals switch it back off, so their
 * narrow panels stay compact.
 */
export const RoomyContext = createContext(false);

export function useRoomy() {
  return useContext(RoomyContext);
}
