"use client";
/**
 * Feature 34 — Posts and drafts, with the content-history CSV export
 * (retained one year; withdrawn media left out of exports).
 */
import { useState } from "react";
import { Download, PenSquare } from "lucide-react";
import { act, useDb } from "@/features/lib/store";
import { AppLink } from "@/features/lib/navigation";
import { downloadCsv } from "@/features/lib/export";
import { toast } from "@/features/lib/toast";
import { now } from "@/features/lib/clock";
import { dateLong } from "@/features/lib/format";
import { addDays } from "@/features/lib/rules/dates";
import { localLabel } from "@/features/lib/rules/marketing";
import { logContentExport, postChecks, TEMPLATE_LABEL } from "@/features/lib/store/actions/marketing";
import { PageHeader } from "@/features/components/layout/screen";
import { Badge, Button, Card, EmptyState, PillTabs, Table, TD, TH, THead, TR } from "@/features/components/ui";
import { MarketingFrame } from "./marketing-frame";
import { PlatformChip, PostStateBadge } from "./shared";

export function PostsScreen() {
  return (
    <MarketingFrame tab="posts">
      <Posts />
    </MarketingFrame>
  );
}

const FILTERS = [
  { value: "all", label: "All" }, { value: "draft", label: "Drafts" }, { value: "awaiting_approval", label: "Awaiting owner" },
  { value: "scheduled", label: "Scheduled" }, { value: "published", label: "Published" }, { value: "problem", label: "Missed or failed" },
];

function Posts() {
  const db = useDb((d) => d);
  const [filter, setFilter] = useState("all");
  const list = db.marketingPosts.filter((p) => filter === "all" || (filter === "problem" ? p.state === "missed" || p.state === "partially_failed" : filter === "draft" ? p.state === "draft" || p.state === "approved" : p.state === filter));

  const csv = () => {
    const since = addDays(now(), -365);
    const withdrawn = new Set(db.mediaAssets.filter((a) => a.withdrawnAt).map((a) => a.id));
    const rows = db.marketingPosts.filter((p) => p.createdAt >= since);
    downloadCsv("content-history.csv", [
      ["Content history, last 12 months. Withdrawn media is excluded from exports."],
      ["post", "title", "template", "state", "version", "platforms", "scheduled_local", "published", "media", "approved_by", "created"],
      ...rows.map((p) => [p.id, p.title, TEMPLATE_LABEL[p.template], p.state, p.version, p.platforms.join("+"), p.schedule ? localLabel(p.schedule.utc) : "",
        p.publications.filter((x) => x.status === "published").map((x) => `${x.platform}:${x.externalRef}`).join(" "), p.assetIds.filter((a) => !withdrawn.has(a)).join(" "),
        p.approval ? db.users.find((u) => u.id === p.approval!.by)?.name : "", p.createdAt.slice(0, 10)]),
    ]);
    act(logContentExport, rows.length);
    toast.success("Content history exported", "Last 12 months. Withdrawn media left out.");
  };

  return (
    <>
      <PageHeader
        title="Posts & Drafts"
        subtitle="Every post with its version, approval and per-platform result."
        actions={<><Button onClick={csv}><Download className="h-4 w-4" /> Export Content CSV</Button><AppLink href="/marketing/compose"><Button variant="primary"><PenSquare className="h-4 w-4" /> New Post</Button></AppLink></>}
      />
      <div className="mb-4 overflow-x-auto"><PillTabs value={filter} onChange={setFilter} options={FILTERS} /></div>
      <Card className="p-4">
        {list.length === 0 ? <EmptyState title="No posts here" /> : (
          <Table>
            <THead><tr><TH>Post</TH><TH>Template</TH><TH>Platforms</TH><TH>State</TH><TH>Owner approval</TH><TH>When</TH></tr></THead>
            <tbody>
              {list.map((p) => {
                const c = postChecks(db, p);
                return (
                  <TR key={p.id}>
                    <TD className="max-w-[280px] whitespace-normal"><AppLink href={`/marketing/compose?id=${p.id}`} className="font-semibold text-ink hover:text-brand">{p.title}</AppLink><div className="text-[11px] text-slate-400">{p.id} · v{p.version}{p.copiedFrom ? ` · copied from ${p.copiedFrom}` : ""}</div></TD>
                    <TD>{TEMPLATE_LABEL[p.template]}</TD>
                    <TD><div className="flex gap-1">{p.platforms.map((pl) => <PlatformChip key={pl} platform={pl} status={p.publications.find((x) => x.platform === pl)?.status} />)}</div></TD>
                    <TD><div className="flex flex-wrap gap-1"><PostStateBadge state={p.state} />{p.takedown && !p.takedown.doneAt && <Badge tone="red">Takedown</Badge>}</div></TD>
                    <TD className="text-[12px]">{!c.needsApproval ? <span className="text-slate-400">Not required</span> : c.approved ? <Badge tone="green">Approved v{p.approval!.version}</Badge> : p.approvalVoided ? <Badge tone="amber">Voided — material edit</Badge> : <Badge tone="purple">Required</Badge>}</TD>
                    <TD className="whitespace-nowrap text-[12px] text-slate-600">{p.schedule ? localLabel(p.schedule.utc) : `Created ${dateLong(p.createdAt)}`}</TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
