"use client";
/**
 * Feature 34 — photo upload, from the Media Library or straight from the composer.
 *
 * Drag photos in or choose them, check the thumbnails, then upload. Each photo
 * is checked (JPG, PNG or WebP, under 8 MB, no video), resized in the browser
 * and stored on its media record, so everyone viewing the demo sees it.
 */
import { useEffect, useRef, useState, type DragEvent } from "react";
import { ImagePlus, Upload, X } from "lucide-react";
import type { MediaAsset } from "@/features/types";
import type { ReleaseRecord } from "@/features/types/marketing-social";
import { act, useDb } from "@/features/lib/store";
import { cn } from "@/features/lib/cn";
import { toast } from "@/features/lib/toast";
import { MAX_UPLOAD_MB, UPLOAD_TYPES, validateUpload } from "@/features/lib/rules/marketing";
import { uploadMedia } from "@/features/lib/store/actions/marketing";
import { imageFileToJpeg } from "@/lib/image";
import { Button, Checkbox, Field, Input, Modal, Select, Textarea } from "@/features/components/ui";

/** Long side of the stored photo. Big enough for a sharp feed preview, small enough for the shared demo record. */
const STORED_SIDE = 960;

interface Staged {
  key: string;
  file: File;
  label: string;
  url: string;
  error?: string;
}

/** Size in MB, one decimal, never 0 for a real file. */
const mb = (bytes: number) => Math.max(0.1, Math.round((bytes / 1024 / 1024) * 10) / 10);
const sizeLabel = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${mb(bytes)} MB`);

function stage(files: File[]): Staged[] {
  return files.map((file, i) => ({
    key: `${Date.now()}-${i}-${file.name}`,
    file,
    label: file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim(),
    url: URL.createObjectURL(file),
    error: validateUpload({ sizeMb: mb(file.size), type: file.type }).error,
  }));
}

export type ReleaseInput = { type: ReleaseRecord["type"]; givenBy: string; note: string };

/** How the customer gave permission, who gave it, and the note of what they agreed to. */
export function ReleaseFields({ value, onChange, errors }: { value: ReleaseInput; onChange: (v: ReleaseInput) => void; errors?: { field?: string; error: string } }) {
  const set = <K extends keyof ReleaseInput>(k: K, v: ReleaseInput[K]) => onChange({ ...value, [k]: v });
  const errorFor = (f: string) => (errors?.field === f ? errors.error : undefined);
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="How permission was given" hint={value.type === "verbal_approval" ? "Phone or in person." : "Email, text or a signed form."}>
          <Select value={value.type} onChange={(e) => set("type", e.target.value as ReleaseInput["type"])}>
            <option value="verbal_approval">Verbally</option>
            <option value="written_approval">In writing</option>
          </Select>
        </Field>
        <Field label="Given by" required error={errorFor("givenBy")}>
          <Input value={value.givenBy} onChange={(e) => set("givenBy", e.target.value)} placeholder="Customer's name" />
        </Field>
      </div>
      <Field label="Note" required error={errorFor("note") ?? (errors && !errors.field ? errors.error : undefined)} hint="What they agreed to, and when. This is the record if anyone asks later.">
        <Textarea rows={3} value={value.note} onChange={(e) => set("note", e.target.value)} placeholder={value.type === "verbal_approval" ? "e.g. Said yes on the phone on 5 Oct. OK to show the front of the house, not the house number." : "e.g. Texted on 5 Oct: \"Happy for you to post the photos.\""} />
      </Field>
    </div>
  );
}

/** Dashed drop area. Clicking it opens the file picker. */
export function DropZone({ onFiles, compact, className }: { onFiles: (files: File[]) => void; compact?: boolean; className?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const drop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const files = [...e.dataTransfer.files];
    if (files.length) onFiles(files);
  };
  return (
    <button
      type="button"
      onClick={() => input.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={drop}
      className={cn("flex w-full flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed text-center transition", compact ? "px-3 py-4" : "px-4 py-8", over ? "border-brand bg-brand/5" : "border-line hover:border-gray-300 hover:bg-gray-50", className)}
    >
      <ImagePlus className={cn("text-gray-400", compact ? "h-5 w-5" : "h-7 w-7")} />
      <span className="text-sm font-semibold text-ink">Drag photos here, or <span className="text-brand">choose files</span></span>
      <span className="text-xs text-gray-500">JPG, PNG or WebP, under {MAX_UPLOAD_MB} MB each. Several at once is fine.</span>
      <input
        ref={input}
        type="file"
        multiple
        accept={UPLOAD_TYPES.join(",")}
        className="hidden"
        onChange={(e) => { const files = [...(e.target.files ?? [])]; e.target.value = ""; if (files.length) onFiles(files); }}
      />
    </button>
  );
}

/** The upload pop-up. `files` pre-fills it (from a drop on the page). Calls onUploaded with the new media IDs. */
export function UploadPhotosModal({ open, files, onClose, onUploaded }: { open: boolean; files?: File[]; onClose: () => void; onUploaded?: (ids: string[]) => void }) {
  const jobs = useDb((d) => d.jobs);
  const customers = useDb((d) => d.customers);
  const [staged, setStaged] = useState<Staged[]>([]);
  const [kind, setKind] = useState<MediaAsset["kind"]>("surface_detail");
  const [jobId, setJobId] = useState("");
  // The customer's permission for this batch, when it was already given.
  const [permitted, setPermitted] = useState(false);
  const [release, setRelease] = useState<ReleaseInput>({ type: "verbal_approval", givenBy: "", note: "" });
  const [releaseErr, setReleaseErr] = useState<{ field?: string; error: string }>();
  const customerOf = (id: string) => customers.find((c) => c.id === jobs.find((j) => j.id === id)?.customerId)?.name ?? "";
  const [busy, setBusy] = useState(false);
  const urls = useRef(new Set<string>());

  const add = (list: File[]) => {
    const next = stage(list);
    next.forEach((s) => urls.current.add(s.url));
    setStaged((cur) => [...cur, ...next]);
  };
  const drop = (key: string) => setStaged((cur) => {
    const gone = cur.find((s) => s.key === key);
    if (gone) { URL.revokeObjectURL(gone.url); urls.current.delete(gone.url); }
    return cur.filter((s) => s.key !== key);
  });

  // Files dropped on the page arrive with the opening.
  useEffect(() => { if (open && files?.length) add(files); }, [open, files]);
  // Free the thumbnails when the pop-up closes.
  useEffect(() => {
    if (open) return;
    urls.current.forEach((u) => URL.revokeObjectURL(u));
    urls.current.clear();
    setStaged([]);
    setPermitted(false);
    setRelease({ type: "verbal_approval", givenBy: "", note: "" });
    setReleaseErr(undefined);
  }, [open]);

  const ready = staged.filter((s) => !s.error);
  const withRelease = permitted && kind !== "crew";
  const upload = async () => {
    setReleaseErr(undefined);
    if (withRelease && !release.givenBy.trim()) return setReleaseErr({ field: "givenBy", error: "Say who gave permission." });
    if (withRelease && !release.note.trim()) return setReleaseErr({ field: "note", error: "Note what the customer agreed to, and when." });
    setBusy(true);
    const ids: string[] = [];
    const failed: Staged[] = [];
    for (const s of ready) {
      try {
        const img = await imageFileToJpeg(s.file, STORED_SIDE, 0.72);
        const r = act(uploadMedia, { label: s.label, sizeMb: mb(s.file.size), type: s.file.type, kind, jobId: jobId || undefined, ...img, release: withRelease ? release : undefined });
        if (r.ok) ids.push(r.value!);
        else failed.push({ ...s, error: r.error });
      } catch (e) {
        failed.push({ ...s, error: e instanceof Error ? e.message : "That file could not be read as an image." });
      }
    }
    setBusy(false);
    if (ids.length) {
      toast.success(`${ids.length} photo${ids.length === 1 ? "" : "s"} uploaded`, ids.join(", "));
      onUploaded?.(ids);
    }
    if (!failed.length) return onClose();
    // Keep the photos that failed (and any that never passed the check) so they can be fixed or removed.
    const failedKeys = new Set(failed.map((f) => f.key));
    const uploaded = new Set(ready.filter((s) => !failedKeys.has(s.key)).map((s) => s.key));
    setStaged((cur) => cur.filter((s) => {
      if (!uploaded.has(s.key)) return true;
      URL.revokeObjectURL(s.url);
      urls.current.delete(s.url);
      return false;
    }).map((s) => failed.find((f) => f.key === s.key) ?? s));
  };

  return (
    <Modal
      open={open}
      onOpenChange={(v) => !v && !busy && onClose()}
      size="lg"
      title="Upload photos"
      description="Finished job photos for marketing. Photos of a customer's house need their permission before they can be posted."
      footer={<><Button onClick={onClose} disabled={busy}>Cancel</Button><Button variant="primary" disabled={busy || ready.length === 0} onClick={() => void upload()}><Upload className="h-4 w-4" /> {busy ? "Uploading…" : `Upload ${ready.length || ""} photo${ready.length === 1 ? "" : "s"}`}</Button></>}
    >
      <div className="space-y-4">
        <DropZone compact={staged.length > 0} onFiles={add} />
        {staged.length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {staged.map((s) => (
              <div key={s.key} className={cn("rounded-xl border p-2", s.error ? "border-red-300 bg-red-50/50" : "border-line")}>
                <div className="relative h-28 overflow-hidden rounded-lg bg-gray-100">
                  {!s.error && <img src={s.url} alt={s.label} className="h-full w-full object-cover" />}
                  <button type="button" aria-label={`Remove ${s.file.name}`} onClick={() => drop(s.key)} className="absolute right-1 top-1 rounded-full bg-white/90 p-1 text-gray-600 shadow hover:text-ink"><X className="h-3.5 w-3.5" /></button>
                </div>
                <Input className="mt-2" aria-label="Label" value={s.label} disabled={!!s.error} onChange={(e) => setStaged((cur) => cur.map((x) => (x.key === s.key ? { ...x, label: e.target.value } : x)))} />
                <div className="mt-1 text-xs text-gray-500">{sizeLabel(s.file.size)} ·{s.file.type.replace("image/", "").toUpperCase() || "unknown type"}</div>
                {s.error && <div className="mt-1 text-xs text-red-700">{s.error}</div>}
              </div>
            ))}
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="What the photos show" hint="Applies to every photo in this upload.">
            <Select value={kind} onChange={(e) => setKind(e.target.value as MediaAsset["kind"])}>
              <option value="surface_detail">Surface detail</option>
              <option value="customer_property">Customer property</option>
              <option value="crew">Crew</option>
              <option value="seasonal">Seasonal</option>
            </Select>
          </Field>
          <Field label="Job" hint="Links the photos to the job and its release.">
            <Select value={jobId} onChange={(e) => { setJobId(e.target.value); if (!release.givenBy.trim()) setRelease((r) => ({ ...r, givenBy: customerOf(e.target.value) })); }}>
              <option value="">No job</option>
              {jobs.map((j) => <option key={j.id} value={j.id}>{j.id}</option>)}
            </Select>
          </Field>
        </div>
        {kind === "crew" ? <p className="text-xs text-gray-500">Crew photos are covered by the employee&apos;s hiring release.</p> : (
          <div className="rounded-xl border border-line p-3">
            <Checkbox checked={permitted} onCheckedChange={(v) => { setPermitted(v); if (v && !release.givenBy.trim()) setRelease((r) => ({ ...r, givenBy: customerOf(jobId) })); }} label="The customer has already given permission to post these photos" />
            {permitted ? <div className="mt-3"><ReleaseFields value={release} onChange={setRelease} errors={releaseErr} /></div>
              : <p className="mt-1 pl-6 text-xs text-gray-500">Leave unticked if you haven&apos;t asked yet. You can record permission on each photo later. Until then, photos of a customer&apos;s house can&apos;t be posted.</p>}
          </div>
        )}
      </div>
    </Modal>
  );
}

/** "Upload photos" button with its pop-up. */
export function UploadPhotosButton({ onUploaded, variant = "primary", size }: { onUploaded?: (ids: string[]) => void; variant?: "primary" | "secondary"; size?: "sm" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} size={size} onClick={() => setOpen(true)}><Upload className="h-4 w-4" /> Upload photos</Button>
      <UploadPhotosModal open={open} onClose={() => setOpen(false)} onUploaded={onUploaded} />
    </>
  );
}
