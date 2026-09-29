"use client";
/**
 * Feature 34 — Media Library.
 *
 * Job media carries its release evidence. Crops are new assets; the original
 * is preserved. Uploads are finished photographs under 8 MB — no video.
 * A withdrawal takes the media out of every future post and export at once,
 * and puts published posts on the takedown list.
 */
import { useState } from "react";
import { Crop, ShieldOff, Upload } from "lucide-react";
import type { MediaAsset, PostTemplate } from "@/features/types";
import { act, useCurrentUser, useDb } from "@/features/lib/store";
import { can } from "@/features/lib/permissions";
import { byId } from "@/features/lib/selectors";
import { AppLink } from "@/features/lib/navigation";
import { dateLong } from "@/features/lib/format";
import { toast } from "@/features/lib/toast";
import { MAX_UPLOAD_MB, TEMPLATE_SIZES } from "@/features/lib/rules/marketing";
import { createCrop, TEMPLATE_LABEL, uploadMedia, withdrawMedia } from "@/features/lib/store/actions/marketing";
import { userName } from "@/features/lib/store/helpers";
import { PageHeader } from "@/features/components/layout/screen";
import { Badge, Banner, Button, Card, CardLabel, Checkbox, Field, Input, Modal, Select, Textarea } from "@/features/components/ui";
import { jobHref } from "@/features/lib/hrefs";
import { MarketingFrame } from "./marketing-frame";
import { AssetTile } from "./shared";

export function MediaScreen() {
  return (
    <MarketingFrame tab="media">
      <Media />
    </MarketingFrame>
  );
}

function Media() {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const [cropping, setCropping] = useState<MediaAsset>();
  const [withdrawing, setWithdrawing] = useState<MediaAsset>();
  const office = can(user, "marketing.post");
  const withdrawn = db.mediaAssets.filter((a) => a.withdrawnAt);
  const takedowns = db.marketingPosts.filter((p) => p.takedown);
  return (
    <>
      <PageHeader title="Media Library" subtitle="Finished job photographs with their release evidence. Only the neighbourhood is ever shown; job media and releases are kept ten years against the job, unless a personal-data deletion overrides it." />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px] [&>*]:min-w-0">
        <Card className="p-4" data-tour="marketing-library">
          <CardLabel>Job media</CardLabel>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {db.mediaAssets.map((a) => (
              <div key={a.id} className="rounded-xl border border-line p-2">
                <AssetTile asset={a} />
                <div className="mt-1.5 text-xs text-gray-500">
                  {a.jobId ? <AppLink href={jobHref(a.jobId)} className="font-semibold text-brand">{a.jobId}</AppLink> : "No job"}{a.neighbourhood ? ` · ${a.neighbourhood}` : ""} · {a.sizeMb} MB
                  {a.releaseRef && <div className="mt-0.5">Release: {a.releaseRef}</div>}
                  {a.identifyingNote && <div className="mt-0.5">Note: {a.identifyingNote}</div>}
                  {a.deletedForPrivacyAt && <div className="mt-0.5 text-red-700">Deleted under a personal-data request {dateLong(a.deletedForPrivacyAt)}</div>}
                </div>
                {office && !a.withdrawnAt && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    <Button size="sm" onClick={() => setCropping(a)}><Crop className="h-3.5 w-3.5" /> Crop</Button>
                    <Button size="sm" variant="ghost" onClick={() => setWithdrawing(a)}><ShieldOff className="h-3.5 w-3.5" /> Withdraw</Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
        <div className="space-y-4">
          {office && <UploadCard />}
          <Card className="p-4">
            <CardLabel>Templates</CardLabel>
            <p className="mt-1 text-xs text-gray-500">Supplied by the office in both sizes, with the logo and brand colors. Overlay only — no image or video generation.</p>
            <ul className="mt-2 space-y-1 text-xs">
              {(Object.keys(TEMPLATE_LABEL) as PostTemplate[]).map((t) => <li key={t} className="flex justify-between gap-2"><span>{TEMPLATE_LABEL[t]}</span><span className="text-gray-500">{TEMPLATE_SIZES.square} · {TEMPLATE_SIZES.vertical}</span></li>)}
            </ul>
          </Card>
        </div>
      </div>

      <Card className="mt-4 p-4" data-tour="marketing-withdrawals">
        <CardLabel>Withdrawals and takedowns</CardLabel>
        <p className="mt-1 text-xs text-gray-500">History is kept. Removing a media item from the queue is never counted as taking a published post down.</p>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <div className="space-y-2">
            {withdrawn.length === 0 && <p className="text-xs italic text-gray-500">No withdrawals.</p>}
            {withdrawn.map((a) => (
              <div key={a.id} className="rounded-lg border border-line px-3 py-2 text-xs">
                <strong>{a.id}</strong> {a.label} <div className="text-gray-500">Withdrawn {dateLong(a.withdrawnAt)} by {userName(db, a.withdrawnBy)} — {a.withdrawReason}</div>
              </div>
            ))}
          </div>
          <div className="space-y-2">
            {takedowns.length === 0 && <p className="text-xs italic text-gray-500">No published posts affected.</p>}
            {takedowns.map((p) => (
              <AppLink key={p.id} href={`/marketing/compose?id=${p.id}`} className="block rounded-lg border border-line px-3 py-2 text-xs hover:border-gray-300">
                <div className="flex flex-wrap items-center gap-1.5"><strong>{p.id}</strong> {p.title} {p.takedown!.doneAt ? <Badge tone="green">Taken down</Badge> : <Badge tone="red">Takedown review</Badge>}{p.takedown!.doneAt && <Badge tone={p.takedown!.spotCheckedBy ? "green" : "amber"}>Spot-check {p.takedown!.spotCheckedBy ? "done" : "pending"}</Badge>}</div>
                <div className="text-gray-500">{p.takedown!.reason}</div>
              </AppLink>
            ))}
          </div>
        </div>
      </Card>

      <CropModal asset={cropping} onClose={() => setCropping(undefined)} />
      <WithdrawModal asset={withdrawing} onClose={() => setWithdrawing(undefined)} />
    </>
  );
}

function UploadCard() {
  const db = useDb((d) => d);
  const [label, setLabel] = useState("");
  const [size, setSize] = useState("3.5");
  const [type, setType] = useState("image/jpeg");
  const [kind, setKind] = useState<MediaAsset["kind"]>("surface_detail");
  const [jobId, setJobId] = useState("JOB-2026-1");
  const [err, setErr] = useState<string>();
  return (
    <Card className="p-4">
      <CardLabel icon={<Upload />}>Upload (simulated)</CardLabel>
      <p className="mt-1 text-xs text-gray-500">Finished phone photographs under {MAX_UPLOAD_MB} MB. No uploaded video at launch.</p>
      <div className="mt-3 space-y-2">
        <Field label="Label"><Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Trim detail after second coat" /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Size (MB)" error={err}><Input type="number" step="0.1" value={size} onChange={(e) => setSize(e.target.value)} /></Field>
          <Field label="File type"><Select value={type} onChange={(e) => setType(e.target.value)}><option value="image/jpeg">Photo (JPEG)</option><option value="image/png">Photo (PNG)</option><option value="video/mp4">Video (MP4)</option></Select></Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Kind"><Select value={kind} onChange={(e) => setKind(e.target.value as MediaAsset["kind"])}><option value="surface_detail">Surface detail</option><option value="customer_property">Customer property</option><option value="crew">Crew</option><option value="seasonal">Seasonal</option></Select></Field>
          <Field label="Job"><Select value={jobId} onChange={(e) => setJobId(e.target.value)}>{db.jobs.map((j) => <option key={j.id} value={j.id}>{j.id}</option>)}</Select></Field>
        </div>
        <Button variant="primary" className="w-full" onClick={() => { setErr(undefined); const r = act(uploadMedia, { label, sizeMb: Number(size), type, kind, jobId }); if (r.ok) { toast.success(`${r.value} uploaded`); setLabel(""); } else setErr(r.error); }}>Upload</Button>
      </div>
    </Card>
  );
}

function CropModal({ asset, onClose }: { asset?: MediaAsset; onClose: () => void }) {
  const [format, setFormat] = useState<"square" | "vertical">("square");
  const [template, setTemplate] = useState<PostTemplate>("finished_job");
  if (!asset) return null;
  return (
    <Modal open onOpenChange={(v) => !v && onClose()} size="sm" title={`Publication crop of ${asset.id}`} description="Creates a new asset with the template overlay. The original job media is preserved unchanged."
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => { const r = act(createCrop, asset.id, format, template); if (r.ok) { toast.success(`${r.value} created`, `Original ${asset.id} kept.`); onClose(); } }}>Create crop</Button></>}>
      <div className="space-y-3">
        <Field label="Format"><Select value={format} onChange={(e) => setFormat(e.target.value as "square" | "vertical")}><option value="square">Square {TEMPLATE_SIZES.square}</option><option value="vertical">Vertical {TEMPLATE_SIZES.vertical}</option></Select></Field>
        <Field label="Template overlay"><Select value={template} onChange={(e) => setTemplate(e.target.value as PostTemplate)}>{(Object.keys(TEMPLATE_LABEL) as PostTemplate[]).map((t) => <option key={t} value={t}>{TEMPLATE_LABEL[t]}</option>)}</Select></Field>
        {asset.identifyingNote && /house number|licen[cs]e plate|street sign/i.test(asset.identifyingNote) && <Banner tone="info">The crop removes the address detail ({asset.identifyingNote.toLowerCase()}).</Banner>}
      </div>
    </Modal>
  );
}

function WithdrawModal({ asset, onClose }: { asset?: MediaAsset; onClose: () => void }) {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const [reason, setReason] = useState("");
  const [privacy, setPrivacy] = useState(false);
  const [err, setErr] = useState<string>();
  if (!asset) return null;
  const family = new Set([asset.id, ...db.mediaAssets.filter((a) => a.cropOf === asset.id).map((a) => a.id)]);
  const uses = db.marketingPosts.filter((p) => p.state !== "cancelled" && p.assetIds.some((a) => family.has(a)));
  return (
    <Modal open onOpenChange={(v) => !v && onClose()} size="sm" title={`Withdraw permission for ${asset.id}`} description={`Also withdraws its crops. Used by ${uses.length} post${uses.length === 1 ? "" : "s"}: ${uses.map((p) => p.id).join(", ") || "none"}.`}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="danger" onClick={() => { const r = act(withdrawMedia, asset.id, reason, privacy); if (r.ok) { toast.success("Permission withdrawn", `Removed from ${r.value} scheduled posts and future exports. Published posts are on the takedown list.`); onClose(); } else setErr(r.error); }}>Withdraw</Button></>}>
      <div className="space-y-3">
        <Field label="How the withdrawal arrived" required error={err}><Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Customer phoned on 25 Sep" /></Field>
        {user.role === "owner" || user.role === "office_manager" ? <Checkbox checked={privacy} onCheckedChange={setPrivacy} label="This is a personal-data deletion request (overrides the ten-year retention)" /> : null}
        {byId(db.mediaAssets, asset.cropOf) && <p className="text-xs text-gray-500">This is a crop of {asset.cropOf}. The original keeps its own release state.</p>}
      </div>
    </Modal>
  );
}
