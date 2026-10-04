"use client";
/**
 * Feature 34 — post preview: the post drawn as the Facebook and Instagram
 * feeds show it, so the office and the business owner see what will go out.
 * A close likeness only; the platform decides the final crop and fonts.
 */
import { useState, type ReactNode } from "react";
import { Bookmark, ChevronLeft, ChevronRight, Globe, Heart, ImageOff, MessageCircle, MoreHorizontal, Send, Share2, ThumbsUp } from "lucide-react";
import type { MarketingPost, MediaAsset, SocialPlatform } from "@/features/types";
import { useDb } from "@/features/lib/store";
import { cn } from "@/features/lib/cn";
import { assetImage } from "@/features/lib/rules/marketing";
import { accountFor, effectiveContent, PLATFORM_LABEL } from "@/features/lib/rules/marketing-social";
import { CAPTION_CUT, captionParts, frameRatio, igHandle, truncateCaption } from "@/features/lib/rules/marketing-preview";
import { AppLink } from "@/features/lib/navigation";
import { Button, Modal, PillTabs } from "@/features/components/ui";
import { PostStateBadge } from "./shared";

/** What the preview draws: the post, or the composer's unsaved form on top of it. */
export type PreviewContent = Pick<MarketingPost, "copy" | "assetIds" | "platforms"> & Partial<Pick<MarketingPost, "variants" | "accountIds">>;

const PREVIEWABLE: SocialPlatform[] = ["facebook", "instagram"];

export function PostPreview({ content, when }: { content: PreviewContent; when?: string }) {
  const platforms = content.platforms.filter((p) => PREVIEWABLE.includes(p));
  const [chosen, setChosen] = useState<SocialPlatform>();
  const platform = chosen && platforms.includes(chosen) ? chosen : platforms[0];
  if (!platform) return <p className="text-xs text-gray-500">Pick Facebook or Instagram to see a preview.</p>;
  return (
    <div>
      {platforms.length > 1 && <PillTabs className="mb-3" value={platform} onChange={(v) => setChosen(v as SocialPlatform)} options={platforms.map((p) => ({ value: p, label: PLATFORM_LABEL[p] }))} />}
      <div className="mx-auto max-w-[380px]">
        {platform === "facebook" ? <FacebookPost content={content} when={when} /> : <InstagramPost content={content} />}
      </div>
      <p className="mt-2 text-center text-xs text-gray-500">A close likeness of the feed. {PLATFORM_LABEL[platform]} decides the final crop and fonts.</p>
    </div>
  );
}

/** Preview pop-up for a saved post, with a link to open it in the composer. */
export function PostPreviewModal({ post, onClose }: { post?: MarketingPost; onClose: () => void }) {
  if (!post) return null;
  return (
    <Modal
      open
      onOpenChange={(v) => !v && onClose()}
      title={post.title}
      description={<span className="inline-flex flex-wrap items-center gap-1.5">{post.id} · v{post.version} <PostStateBadge state={post.state} /></span>}
      footer={<><Button onClick={onClose}>Close</Button><AppLink href={`/marketing/compose?id=${post.id}`}><Button variant="primary">Open post</Button></AppLink></>}
    >
      <PostPreview content={post} />
    </Modal>
  );
}

function usePreviewMedia(content: PreviewContent, platform: SocialPlatform) {
  const db = useDb((d) => d);
  const c = effectiveContent({ copy: content.copy, assetIds: content.assetIds, variants: content.variants }, platform);
  const assets = c.assetIds.map((id) => db.mediaAssets.find((a) => a.id === id)).filter((a): a is MediaAsset => !!a);
  const account = accountFor(db, { accountIds: content.accountIds }, platform);
  return { copy: c.copy, assets, all: db.mediaAssets, account };
}

/* -------------------------------- Facebook -------------------------------- */

function FacebookPost({ content, when }: { content: PreviewContent; when?: string }) {
  const { copy, assets, all, account } = usePreviewMedia(content, "facebook");
  const name = account?.name ?? "Your Facebook Page";
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white text-[15px] leading-snug text-[#050505] shadow-sm">
      <div className="flex items-center gap-2 px-3 pt-3">
        <Avatar name={name} className="bg-[#1877f2]" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-semibold">{name}</div>
          <div className="flex items-center gap-1 text-xs text-[#65676b]">{when ?? "Just now"} · <Globe className="h-3 w-3" /></div>
        </div>
        <MoreHorizontal className="h-5 w-5 text-[#65676b]" />
      </div>
      {copy.trim() && <div className="px-3 py-2"><Caption text={copy} cut={CAPTION_CUT.facebook} more="See more" linkClass="text-[#385898]" /></div>}
      {!copy.trim() && <div className="h-2" />}
      {assets.length > 0 && <FacebookGrid assets={assets} all={all} />}
      <div className="mx-3 flex items-center justify-between border-b border-gray-200 py-2 text-xs text-[#65676b]">
        <span className="flex items-center gap-1"><span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#1877f2]"><ThumbsUp className="h-2.5 w-2.5 text-white" /></span> 0</span>
        <span>0 comments</span>
      </div>
      <div className="grid grid-cols-3 px-1 py-1 text-sm font-semibold text-[#65676b]">
        <span className="flex items-center justify-center gap-1.5 py-1.5"><ThumbsUp className="h-4 w-4" /> Like</span>
        <span className="flex items-center justify-center gap-1.5 py-1.5"><MessageCircle className="h-4 w-4" /> Comment</span>
        <span className="flex items-center justify-center gap-1.5 py-1.5"><Share2 className="h-4 w-4" /> Share</span>
      </div>
    </div>
  );
}

/** Facebook's layouts: one photo at its shape; two side by side; three or more as one large and a row; four as a 2×2; five and up show "+N". */
function FacebookGrid({ assets, all }: { assets: MediaAsset[]; all: MediaAsset[] }) {
  const n = assets.length;
  if (n === 1) return <Photo asset={assets[0]} all={all} ratio={frameRatio(assets[0])} />;
  if (n === 2) return <div className="grid grid-cols-2 gap-0.5">{assets.map((a) => <Photo key={a.id} asset={a} all={all} ratio={0.8} />)}</div>;
  if (n === 4) return <div className="grid grid-cols-2 gap-0.5">{assets.map((a) => <Photo key={a.id} asset={a} all={all} ratio={1} />)}</div>;
  const top = n >= 5 ? assets.slice(0, 2) : assets.slice(0, 1);
  const row = n >= 5 ? assets.slice(2, 5) : assets.slice(1, 3);
  const extra = n - top.length - row.length;
  return (
    <div className="space-y-0.5">
      <div className={cn("grid gap-0.5", top.length === 2 ? "grid-cols-2" : "grid-cols-1")}>{top.map((a) => <Photo key={a.id} asset={a} all={all} ratio={top.length === 2 ? 1 : 1.5} />)}</div>
      <div className={cn("grid gap-0.5", row.length === 3 ? "grid-cols-3" : "grid-cols-2")}>
        {row.map((a, i) => <Photo key={a.id} asset={a} all={all} ratio={1} overlay={i === row.length - 1 && extra > 0 ? `+${extra}` : undefined} />)}
      </div>
    </div>
  );
}

/* -------------------------------- Instagram -------------------------------- */

function InstagramPost({ content }: { content: PreviewContent }) {
  const { copy, assets, all, account } = usePreviewMedia(content, "instagram");
  const [index, setIndex] = useState(0);
  const handle = igHandle(account?.name ?? "yourbusiness");
  const at = Math.min(index, Math.max(0, assets.length - 1));
  // Every slide of a carousel takes the first photo's shape.
  const ratio = frameRatio(assets[0]);
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white text-sm text-[#000] shadow-sm">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <span className="rounded-full bg-gradient-to-tr from-[#feda75] via-[#d62976] to-[#4f5bd5] p-[2px]"><Avatar name={handle} className="border-2 border-white bg-gray-800" small /></span>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{handle}</span>
        <MoreHorizontal className="h-5 w-5" />
      </div>
      {assets.length === 0 ? (
        <div className="flex aspect-square flex-col items-center justify-center gap-1 bg-gray-100 px-6 text-center text-xs text-gray-500">
          <ImageOff className="h-6 w-6" /> Instagram needs at least one photo. Pick one under Media.
        </div>
      ) : (
        <div className="relative">
          <Photo asset={assets[at]} all={all} ratio={ratio} />
          {assets.length > 1 && (
            <>
              <span className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-xs font-semibold text-white">{at + 1}/{assets.length}</span>
              {at > 0 && <CarouselButton side="left" onClick={() => setIndex(at - 1)} />}
              {at < assets.length - 1 && <CarouselButton side="right" onClick={() => setIndex(at + 1)} />}
            </>
          )}
        </div>
      )}
      <div className="relative flex items-center gap-3.5 px-3 pt-2.5">
        <Heart className="h-6 w-6" /><MessageCircle className="h-6 w-6 -scale-x-100" /><Send className="h-6 w-6" />
        {assets.length > 1 && (
          <span className="absolute left-1/2 flex -translate-x-1/2 gap-1">{assets.map((a, i) => <span key={a.id} className={cn("h-1.5 w-1.5 rounded-full", i === at ? "bg-[#0095f6]" : "bg-gray-300")} />)}</span>
        )}
        <Bookmark className="ml-auto h-6 w-6" />
      </div>
      <div className="px-3 pb-3 pt-2">
        <div className="text-sm font-semibold">0 likes</div>
        {copy.trim() && <div className="mt-1"><Caption text={copy} cut={CAPTION_CUT.instagram} more="more" lead={<span className="mr-1 font-semibold">{handle}</span>} linkClass="text-[#00376b]" muted /></div>}
        <div className="mt-1 text-xs uppercase text-gray-500">Just now</div>
      </div>
    </div>
  );
}

function CarouselButton({ side, onClick }: { side: "left" | "right"; onClick: () => void }) {
  return (
    <button type="button" aria-label={side === "left" ? "Previous photo" : "Next photo"} onClick={onClick}
      className={cn("absolute top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-gray-800 shadow", side === "left" ? "left-2" : "right-2")}>
      {side === "left" ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
    </button>
  );
}

/* --------------------------------- Shared ---------------------------------- */

function Avatar({ name, className, small }: { name: string; className?: string; small?: boolean }) {
  const initials = name.replace(/^@/, "").split(/[\s._-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
  return <span className={cn("flex shrink-0 items-center justify-center rounded-full font-bold text-white", small ? "h-8 w-8 text-xs" : "h-10 w-10 text-sm", className)}>{initials || "EM"}</span>;
}

/** A photo at a feed shape. Seed media without a file shows its tint and label. */
function Photo({ asset, all, ratio, overlay }: { asset: MediaAsset; all: MediaAsset[]; ratio: number; overlay?: string }) {
  const src = assetImage(all, asset);
  return (
    <div className="relative w-full overflow-hidden" style={{ aspectRatio: String(ratio), background: `linear-gradient(135deg, ${asset.hex}, ${asset.hex}cc)` }}>
      {src ? <img src={src} alt={asset.label} className="absolute inset-0 h-full w-full object-cover" />
        : <span className="absolute inset-0 flex items-center justify-center p-3"><span className="flex flex-col items-center gap-0.5 rounded-lg bg-black/55 px-3 py-2 text-center text-xs font-semibold text-white">{asset.label}<span className="font-normal opacity-90">Sample photo · {asset.id}</span></span></span>}
      {overlay && <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-2xl font-bold text-white">{overlay}</span>}
    </div>
  );
}

/** The caption, cut off behind "See more" / "more" the way the feed does, with hashtags and mentions coloured. */
function Caption({ text, cut, more, lead, linkClass, muted }: { text: string; cut: { chars: number; lines: number }; more: string; lead?: ReactNode; linkClass: string; muted?: boolean }) {
  const [open, setOpen] = useState(false);
  const t = truncateCaption(text, cut);
  const shown = open ? text : t.shown;
  return (
    <p className="whitespace-pre-line break-words">
      {lead}
      {captionParts(shown).map((p, i) => (p.link ? <span key={i} className={linkClass}>{p.text}</span> : <span key={i}>{p.text}</span>))}
      {t.cut && !open && <>{"… "}<button type="button" onClick={() => setOpen(true)} className={cn("font-semibold hover:underline", muted ? "text-gray-500" : "text-[#050505]")}>{more}</button></>}
    </p>
  );
}
