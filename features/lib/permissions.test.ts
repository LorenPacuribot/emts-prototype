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

describe("QA D-02 — Settings pages check access themselves", () => {
  it("only the owner and office manager open the admin pages; everyone has My Profile", async () => {
    const { canOpenSettings } = await import("@/features/components/features/settings/settings-config");
    const as = (role: User["role"]) => ({ id: "U", name: "U", role, email: "" }) as User;
    for (const page of ["payment-gateway", "team-access", "roles-permissions", "general", "tax-regions"]) {
      expect(canOpenSettings(as("owner"), page), page).toBe(true);
      expect(canOpenSettings(as("office_manager"), page), page).toBe(true);
      for (const role of ["estimator", "crew_lead", "bookkeeper", "senior_estimator"] as const) expect(canOpenSettings(as(role), page), `${role} ${page}`).toBe(false);
    }
    expect(canOpenSettings(as("senior_estimator"), "surface-rates")).toBe(true);
    expect(canOpenSettings(as("crew_lead"), "my-profile")).toBe(true);
  });
});
