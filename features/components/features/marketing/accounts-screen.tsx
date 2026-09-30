"use client";
/**
 * NEW (34, needs client confirmation) — Settings › Social Accounts
 * (/settings/social-accounts), moved from /marketing/accounts. Registered in
 * the four live places (sidebar, SETTINGS_TITLES, SETTINGS_PERMISSIONS, route).
 *
 * The business owner supplies the account IDs and administrator access and
 * controls them. Publishing is tested on a test page and account first.
 * Access problems flag the affected scheduled posts; a departure removes
 * access and keeps the post history.
 */
import { AlertTriangle, KeyRound, UserMinus } from "lucide-react";
import type { SocialPlatform } from "@/features/types";
import { act, useCurrentUser, useDb } from "@/features/lib/store";
import { can } from "@/features/lib/permissions";
import { dateLong } from "@/features/lib/format";
import { toast } from "@/features/lib/toast";
import { now } from "@/features/lib/clock";
import { affectedPosts, PLATFORM_LABEL, reconnectAccount, removeAccess, simulateAccountIssue, switchToDraftFallback } from "@/features/lib/store/actions/marketing";
import { userName } from "@/features/lib/store/helpers";
import { Badge, Banner, Button, Card, CardLabel, KV, DemoButton } from "@/features/components/ui";
import { SettingsShell } from "@/features/components/features/settings/settings-shell";
import { PlatformChip } from "./shared";

export function AccountsScreen() {
  return (
    <SettingsShell page="social-accounts" subtitle="Facebook and Instagram publishing accounts." details="Publishing only. The business owner controls the accounts; the office drafts and posts.">
      <Accounts />
    </SettingsShell>
  );
}

function Accounts() {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const owner = can(user, "marketing.accounts");
  const sim = (p: SocialPlatform, s: "expired" | "suspended") => { const r = act(simulateAccountIssue, p, s); if (r.ok) toast.info(`${PLATFORM_LABEL[p]} access ${s}`, `Office manager notified. ${r.value} scheduled posts flagged.`); };
  return (
    <>
      <Banner tone="info" className="mb-4">Advertising stays in Meta. There is no ad management and no spend here, and a scheduled organic post is never treated as an authorized advertisement. The owner approves advertising budgets in Meta.</Banner>
      <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        {db.socialAccounts.map((a) => {
          const days = Math.ceil((new Date(a.expiresAt).getTime() - new Date(now()).getTime()) / 86_400_000);
          const affected = affectedPosts(db, a.platform);
          return (
            <Card key={a.platform} className="p-4" data-tour={a.platform === "facebook" ? "marketing-account-card" : undefined}>
              <CardLabel right={<PlatformChip platform={a.platform} />}>{PLATFORM_LABEL[a.platform]}</CardLabel>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {a.status === "connected" ? <Badge tone="green">Connected</Badge> : <Badge tone="red" icon={<AlertTriangle className="h-3 w-3" />}>Access {a.status}</Badge>}
                {a.status === "connected" && days <= 14 && <Badge tone="amber">Expires in {days} days</Badge>}
                {a.test && <Badge tone="gray">Test account — used before production</Badge>}
                <Badge tone={a.mode === "publish" ? "blue" : "purple"}>{a.mode === "publish" ? "Direct publishing" : "Draft-for-approval fallback"}</Badge>
              </div>
              <KV className="mt-3" items={[
                ["Account", a.name], ["Business account ID", a.accountId], ["Access expires", dateLong(a.expiresAt)],
                ["Scheduled posts on this account", affected.length ? affected.map((p) => p.id).join(", ") : "None"],
                ...(a.ownerNotifiedAt ? [["Owner notified of fallback", dateLong(a.ownerNotifiedAt)] as [string, string]] : []),
              ]} />
              {a.status !== "connected" && <Banner tone="danger" className="mt-3">Affected scheduled posts are flagged: {affected.map((p) => p.id).join(", ") || "none"}. They fail on this platform until access is renewed.</Banner>}
              <div className="mt-3">
                <div className="text-xxs font-bold uppercase tracking-wide text-gray-500">Administrator access</div>
                <div className="mt-1 space-y-1">
                  {a.access.map((u) => (
                    <div key={u} className="flex items-center justify-between gap-2 text-xs">
                      <span>{userName(db, u)}</span>
                      {owner && u !== user.id && <Button size="sm" variant="ghost" onClick={() => act(removeAccess, u).ok && toast.success(`Access removed for ${userName(db, u)}`, "Post history kept.")}><UserMinus className="h-3.5 w-3.5" /> Departure</Button>}
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
                {owner && a.status !== "connected" && <Button variant="primary" onClick={() => act(reconnectAccount, a.platform).ok && toast.success("Access renewed")}><KeyRound className="h-4 w-4" /> Renew access</Button>}
                {owner && a.status === "connected" && days <= 14 && <Button onClick={() => act(reconnectAccount, a.platform).ok && toast.success("Access renewed for 60 days")}><KeyRound className="h-4 w-4" /> Renew now</Button>}
                {a.status === "connected" && <><DemoButton size="sm" onClick={() => sim(a.platform, "expired")}>Simulate expiry</DemoButton><DemoButton size="sm" onClick={() => sim(a.platform, "suspended")}>Simulate suspension</DemoButton></>}
                {a.mode === "publish" && <DemoButton size="sm" onClick={() => act(switchToDraftFallback, a.platform).ok && toast.info("Draft-for-approval fallback in use", "The business owner has been notified. Launch isn't delayed.")}>Simulate draft-only permission</DemoButton>}
              </div>
            </Card>
          );
        })}
      </div>
      <Card className="mt-4 p-4">
        <CardLabel>Launch gates</CardLabel>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-gray-600">
          <li>The business owner supplies the Facebook and Instagram business account IDs and administrator access before setup; Meta permissions are verified early.</li>
          <li>The office supplies the image templates in 1080 × 1080 and 1080 × 1350, with the logo and brand colors.</li>
          <li>The business owner and the bookkeeper review the photo-release wording before launch.</li>
          <li>The office manager confirms the website form platform before build.</li>
          <li>Publishing is tested on a test Facebook page and Instagram account. No advertising-spend test is needed.</li>
        </ul>
      </Card>
    </>
  );
}
