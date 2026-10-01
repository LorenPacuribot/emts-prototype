import { describe, expect, it } from "vitest";
import type { Role, User } from "@/features/types";
import { can } from "./permissions";

const as = (role: Role) => ({ id: `U-${role}`, name: role, role }) as User;

describe("D3 (2 Oct 2026) — QuickBooks connection is for Owner and Admin", () => {
  it("owner and office manager (Admin) connect, disconnect and set sync options", () => {
    expect(can(as("owner"), "finance.connect")).toBe(true);
    expect(can(as("office_manager"), "finance.connect")).toBe(true);
  });
  it("nobody else does", () => {
    for (const role of ["bookkeeper", "senior_estimator", "estimator", "crew_lead"] as Role[]) expect(can(as(role), "finance.connect")).toBe(false);
  });
});
