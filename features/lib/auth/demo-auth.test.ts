import { describe, expect, it } from "vitest";
import {
  checkSignIn, createCredential, findAccount, isPublicPath, passwordProblem, safeNext, SEED_CREDENTIALS, SEED_HINTS, verifyPassword,
} from "./demo-auth";

const accounts = [
  { id: "U-OWNER", firstName: "Tim", lastName: "Skelly", email: "tim@estimatemaster.app" },
  { id: "U-OFFICE", firstName: "Dana", lastName: "Ruiz", email: "dana@estimatemaster.app" },
  { id: "U-CREW", firstName: "Luis", lastName: "Ortega", email: "luis@estimatemaster.app", status: "Inactive" },
];

describe("demo sign-in", () => {
  it("every seed hint password matches its precomputed hash", async () => {
    for (const h of SEED_HINTS) expect(await verifyPassword(SEED_CREDENTIALS[h.userId], h.password)).toBe(true);
  });

  it("signs in by first name, email or first.last, and gives one message for any failure", async () => {
    expect((await checkSignIn(accounts, SEED_CREDENTIALS, "tim", "demo-tim")).ok).toBe(true);
    expect((await checkSignIn(accounts, SEED_CREDENTIALS, "DANA@estimatemaster.app", "demo-dana")).ok).toBe(true);
    expect((await checkSignIn(accounts, SEED_CREDENTIALS, "tim.skelly", "demo-tim")).ok).toBe(true);
    const wrong = await checkSignIn(accounts, SEED_CREDENTIALS, "tim", "nope-nope");
    const unknown = await checkSignIn(accounts, SEED_CREDENTIALS, "nobody", "demo-tim");
    expect(wrong).toEqual(unknown);
    expect(findAccount(accounts, "luis")).toBeUndefined();
  });

  it("new credentials are salted and validated", async () => {
    expect(passwordProblem("short")).toBeDefined();
    const a = await createCredential("U-OWNER", "a-new-password");
    const b = await createCredential("U-OWNER", "a-new-password");
    expect(a.hash).not.toBe(b.hash);
    expect(await verifyPassword(a, "a-new-password")).toBe(true);
  });

  it("keeps customer links public and refuses off-site redirects", () => {
    expect(isPublicPath("/login")).toBe(true);
    expect(isPublicPath("/estimates/view")).toBe(true);
    expect(isPublicPath("/estimates/EST-2026-1/client-view")).toBe(true);
    expect(isPublicPath("/dashboard")).toBe(false);
    expect(safeNext("//evil.example")).toBe("/dashboard");
    expect(safeNext("https://evil.example")).toBe("/dashboard");
    expect(safeNext("/jobs/1")).toBe("/jobs/1");
  });
});
