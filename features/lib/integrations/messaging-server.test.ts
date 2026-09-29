import { beforeEach, describe, expect, it } from "vitest";
import { channelStatus, clearOutbox, normalizePhone, rateLimiter, sameOrigin, sandboxOutbox, sendMessage, validateSend } from "./messaging-server";

const live = { MESSAGING_EMAIL_ENDPOINT_URL: "https://mail.example.com/send", MESSAGING_EMAIL_API_KEY: "k", MESSAGING_FROM_EMAIL: "office@example.com" };

describe("messaging connector", () => {
  beforeEach(() => clearOutbox());

  it("validates messages", () => {
    expect(validateSend({ channel: "fax", to: "x", body: "b" })).toHaveProperty("error");
    expect(validateSend({ channel: "email", to: "not-an-email", subject: "s", body: "b" })).toHaveProperty("error");
    expect(validateSend({ channel: "email", to: "a@b.co", subject: "line\ninjected: x", body: "b" })).toHaveProperty("error");
    expect(validateSend({ channel: "email", to: "a@b.co", body: "b" })).toHaveProperty("error");
    expect(validateSend({ channel: "sms", to: "(512) 555-0101", body: "hi", tag: "lead-stage:new" })).toEqual({ req: { channel: "sms", to: "+15125550101", body: "hi", tag: "lead-stage:new" } });
    expect(normalizePhone("555-0101")).toBeUndefined();
    expect(normalizePhone("+44 20 7946 0958")).toBe("+442079460958");
  });

  it("keeps messages in the sandbox when no endpoint is configured", async () => {
    const r = await sendMessage({ channel: "email", to: "a@b.co", subject: "s", body: "b" }, { env: {} });
    expect(r).toMatchObject({ ok: true, sandbox: true });
    expect(r.messageId).toMatch(/^SBX-/);
    expect(sandboxOutbox()).toHaveLength(1);
    expect(channelStatus("email", {}).live).toBe(false);
  });

  it("delivers through a live endpoint and needs its message id", async () => {
    expect(channelStatus("email", live).live).toBe(true);
    let auth = "";
    const ok = (async (_u: URL, init?: RequestInit) => {
      auth = (init?.headers as Record<string, string>).Authorization;
      return new Response(JSON.stringify({ id: "MSG-9" }));
    }) as unknown as typeof fetch;
    expect(await sendMessage({ channel: "email", to: "a@b.co", subject: "s", body: "b" }, { env: live, fetchImpl: ok })).toEqual({ ok: true, sandbox: false, messageId: "MSG-9" });
    expect(auth).toBe("Bearer k");
    const noId = (async () => new Response("{}")) as unknown as typeof fetch;
    expect((await sendMessage({ channel: "email", to: "a@b.co", subject: "s", body: "b" }, { env: live, fetchImpl: noId })).ok).toBe(false);
    // An endpoint without its key is an error, never a silent sandbox.
    expect(await sendMessage({ channel: "email", to: "a@b.co", subject: "s", body: "b" }, { env: { MESSAGING_EMAIL_ENDPOINT_URL: live.MESSAGING_EMAIL_ENDPOINT_URL } })).toMatchObject({ ok: false, sandbox: false });
  });

  it("rejects cross-site browser requests", () => {
    const req = (h: Record<string, string>) => new Request("https://app.example.com/api/messaging", { method: "POST", headers: { host: "app.example.com", ...h } });
    expect(sameOrigin(req({ "sec-fetch-site": "same-origin", origin: "https://app.example.com" }))).toBe(true);
    expect(sameOrigin(req({ "sec-fetch-site": "cross-site" }))).toBe(false);
    expect(sameOrigin(req({ origin: "https://evil.example" }))).toBe(false);
  });

  it("rate limits per client and a flood of new keys can't reset live windows", () => {
    const hit = rateLimiter(2, 1000);
    expect(hit("a", 0).ok).toBe(true);
    expect(hit("a", 1).ok).toBe(true);
    expect(hit("a", 2)).toEqual({ ok: false, retryAfter: 1 });
    for (let i = 0; i < 6000; i++) hit(`spoof-${i}`, 3);
    expect(hit("a", 4).ok).toBe(false);
    expect(hit("a", 1000).ok).toBe(true);
  });
});
