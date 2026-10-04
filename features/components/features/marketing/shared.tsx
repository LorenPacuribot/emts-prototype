"use client";
/** Shared pieces for the Marketing screens (feature 34). */
import { AlertTriangle, CheckCircle2, Lock, ShieldOff } from "lucide-react";
import type { MediaAsset, PostState, SocialPlatform } from "@/features/types";
import { useDb } from "@/features/lib/store";
import { cn } from "@/features/lib/cn";
import { dateLong } from "@/features/lib/format";
import { now } from "@/features/lib/clock";
import { assetImage, consentState, usable } from "@/features/lib/rules/marketing";
import { affectedPosts, PLATFORM_LABEL } from "@/features/lib/store/actions/marketing";
import { Badge, Card } from "@/features/components/ui";
import type { Tone } from "@/features/components/ui/badge";

export const POST_STATE: Record<PostState, { label: string; tone: Tone; dot: string }> = {
  draft: { label: "Draft", tone: "gray", dot: "bg-gray-400" },
  awaiting_approval: { label: "Awaiting owner approval", tone: "purple", dot: "bg-purple-500" },
  approved: { label: "Approved", tone: "blue", dot: "bg-blue-500" },
  scheduled: { label: "Scheduled", tone: "indigo", dot: "bg-indigo-500" },
  published: { label: "Published", tone: "green", dot: "bg-green-500" },
  missed: { label: "Missed", tone: "amber", dot: "bg-amber-500" },
  partially_failed: { label: "Partially failed", tone: "red", dot: "bg-red-500" },
  cancelled: { label: "Canceled", tone: "gray", dot: "bg-gray-300" },
};

export function PostStateBadge({ state }: { state: PostState }) {
  return <Badge tone={POST_STATE[state].tone}>{POST_STATE[state].label}</Badge>;
}

export function PlatformChip({ platform, status }: { platform: SocialPlatform; status?: "pending" | "published" | "failed" | "uncertain" }) {
  const tone = status === "published" ? "bg-green-50 text-green-700 ring-green-200" : status === "failed" ? "bg-red-50 text-red-700 ring-red-200" : status === "uncertain" ? "bg-amber-50 text-amber-700 ring-amber-200" : platform === "facebook" ? "bg-blue-50 text-blue-700 ring-blue-200" : "bg-pink-50 text-pink-700 ring-pink-200";
  return <span title={`${PLATFORM_LABEL[platform]}${status ? ` — ${status}` : ""}`} className={cn("inline-flex h-5 items-center rounded px-1.5 text-xs font-bold ring-1 ring-inset", tone)}>{platform === "facebook" ? "FB" : "IG"}</span>;
}

export function ConsentBadge({ asset }: { asset: MediaAsset }) {
  const s = consentState(asset);
  if (s === "withdrawn") return <Badge tone="red" className="whitespace-normal" icon={<ShieldOff className="h-3 w-3" />}>Withdrawn {asset.withdrawnAt ? dateLong(asset.withdrawnAt) : ""}</Badge>;
  if (s === "no_release") return <Badge tone="amber" icon={<Lock className="h-3 w-3" />}>No release</Badge>;
  return <Badge tone="green" icon={<CheckCircle2 className="h-3 w-3" />}>Released</Badge>;
}

/** The uploaded photograph, or a tinted tile standing in for seed media. */
export function AssetTile({ asset, selected, onClick, compact }: { asset: MediaAsset; selected?: boolean; onClick?: () => void; compact?: boolean }) {
  const assets = useDb((d) => d.mediaAssets);
  const src = assetImage(assets, asset);
  const u = usable(asset);
  const locked = !u.ok;
  const body = (
    <>
      <div className={cn("relative flex items-end overflow-hidden rounded-lg p-2", compact ? "h-16" : "h-24")} style={{ background: `linear-gradient(135deg, ${asset.hex}, ${asset.hex}cc)` }}>
        {src && <img src={src} alt={asset.label} className="absolute inset-0 h-full w-full object-cover" />}
        {asset.crop && <span className="absolute right-1.5 top-1.5 rounded bg-white/85 px-1 text-xs font-bold text-gray-700">{asset.crop.format === "square" ? "1080×1080" : "1080×1350"}</span>}
        {locked && <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-gray-900/45 text-white"><Lock className="h-5 w-5" /></span>}
        <span className="relative rounded bg-white/85 px-1 text-xs font-bold text-gray-700">{asset.id}</span>
      </div>
      <div className="mt-1.5 text-left">
        <div className="line-clamp-2 text-xs font-semibold text-ink">{asset.label}</div>
        <div className="mt-1 flex flex-wrap gap-1"><ConsentBadge asset={asset} />{asset.cropOf && <Badge tone="gray">Crop of {asset.cropOf}</Badge>}</div>
        {locked && <div className="mt-1 text-xs text-gray-500">{u.reason}</div>}
      </div>
    </>
  );
  if (!onClick) return <div className="min-w-0">{body}</div>;
  return (
    <button type="button" onClick={onClick} disabled={locked} aria-pressed={selected} className={cn("min-w-0 rounded-xl border p-2 text-left transition", selected ? "border-brand ring-2 ring-brand/30" : "border-line hover:border-gray-300", locked && "cursor-not-allowed opacity-80")}>
      {body}
    </button>
  );
}

/** Connection state per platform, access expiry warning and affected scheduled posts. */
export function AccountHealth() {
  const db = useDb((d) => d);
  return (
    <Card className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-2 p-3 text-xs" data-tour="marketing-accounts">
      {db.socialAccounts.map((a) => {
        const days = Math.ceil((new Date(a.expiresAt).getTime() - new Date(now()).getTime()) / 86_400_000);
        const affected = affectedPosts(db, a.platform).length;
        const bad = a.status !== "connected";
        return (
          <div key={a.platform} className="flex flex-wrap items-center gap-2">
            <PlatformChip platform={a.platform} />
            <span className="font-semibold text-ink">{a.name}</span>
            {bad ? <Badge tone="red" icon={<AlertTriangle className="h-3 w-3" />}>Access {a.status} · {affected} scheduled posts affected</Badge>
              : days <= 14 ? <Badge tone="amber">Access expires in {days} days</Badge> : <Badge tone="green">Connected</Badge>}
            {a.test && <Badge tone="gray">Test account</Badge>}
            {a.mode === "draft_for_approval" && <Badge tone="purple">Draft-for-approval fallback</Badge>}
          </div>
        );
      })}
    </Card>
  );
}
