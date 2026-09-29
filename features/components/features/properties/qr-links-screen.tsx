"use client";
import { hrefFor } from "@/features/lib/navigation";
/**
 * Feature 26 — Customer QR Paint Record, internal management.
 * Menu: Properties > {Property} > QR Links
 *
 * Link panel, history panel, contact verification, photograph panel and
 * touch-up panel. Estimators generate, send and print; only the Business
 * Owner and Office Manager revoke, regenerate or replace.
 */
import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  BadgeCheck, Ban, Camera, Copy, CreditCard, ExternalLink, Eye, History, Image as ImageIcon, Link2, Mail, MessageSquare, PaintBucket, PhoneCall, Plus, QrCode, RefreshCw, Send, ShieldAlert, Sticker as StickerIcon,
} from "lucide-react";
import type { Property, QrLink } from "@/features/types";
import { act, useCurrentUser, useDb } from "@/features/lib/store";
import { approvePhoto, generateLink, regenerateLink, reissueAfterVerification, revokeLink, selectPhoto, sendLink, setTouchUpStatus, updateContact, verifyContact } from "@/features/lib/store/actions/qr";
import { can } from "@/features/lib/permissions";
import { byId, currentOwnership, propertyAddress, surfaceLabel } from "@/features/lib/selectors";
import { TOUCHUP_STATUS } from "@/features/lib/status";
import { dateLong, dateTime, titleCase } from "@/features/lib/format";
import { photoShareable } from "@/features/lib/rules/property";
import { toast } from "@/features/lib/toast";
import { PanelHeader as PageHeader } from "@/features/components/features/contacts/details/panel-header";
import { Badge, Banner, Button, Card, CardLabel, Checkbox, ConfirmDialog, EmptyState, Field, IdChip, Input, KV, Modal, Select, Stat, StatStrip, Textarea } from "@/features/components/ui";
import { PrintQrModal, recordUrl } from "./qr-print";
import { periodLabel } from "./property-shared";


type Errors = Record<string, string | undefined>;

export function QrLinksPanel({ property }: { property: Property }) {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const period = currentOwnership(property);
  const owner = byId(db.customers, period.customerId);
  const links = db.qrLinks.filter((l) => l.propertyId === property.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const active = links.find((l) => !l.revokedAt && l.ownershipPeriodId === period.id);
  const history = links.filter((l) => l !== active);
  const canGen = can(user, "qr.generate");
  const canRevoke = can(user, "qr.revoke");

  const [print, setPrint] = useState<"BusinessCard" | "Sticker">();
  const [send, setSend] = useState(false);
  const [revoke, setRevoke] = useState(false);
  const [regen, setRegen] = useState(false);
  const [replace, setReplace] = useState(false);
  const [contact, setContact] = useState(false);

  const gen = () => {
    const res = act(generateLink, property.id);
    if (res.ok) toast.success("Link generated", `Reference ${res.value}. Verify the contact, then send it or print the card.`);
  };
  const copy = async (ref: string) => {
    try {
      await navigator.clipboard.writeText(recordUrl(ref));
      toast.success("Link copied");
    } catch {
      toast.info("Copy this link", recordUrl(ref));
    }
  };

  return (
    <>
      <PageHeader
        title="QR Links"
        subtitle="One read-only link per ownership period. No login: possession of the link grants access, so it shows only what is safe to share."
        actions={
          <>
            {active ? (
              <>
                <Button disabled={!canGen} onClick={() => setPrint("BusinessCard")}><CreditCard className="h-4 w-4" /> Print Card</Button>
                <Button disabled={!canGen} onClick={() => setPrint("Sticker")}><StickerIcon className="h-4 w-4" /> Print Sticker</Button>
                <Button variant="primary" disabled={!canGen} onClick={() => setSend(true)}><Send className="h-4 w-4" /> Send Link</Button>
                {canRevoke && <Button variant="danger" onClick={() => setRevoke(true)}><Ban className="h-4 w-4" /> Revoke</Button>}
              </>
            ) : (
              <Button variant="primary" disabled={!canGen} onClick={gen}><Plus className="h-4 w-4" /> Generate Link</Button>
            )}
          </>
        }
      />

      {!canGen && <Banner tone="info" className="mb-4" title="Read-only for your role">Estimators and the Office Manager generate, send and print links.</Banner>}
      {canGen && !canRevoke && <Banner tone="info" className="mb-4">Revoke, Regenerate and Replace are available to the Business Owner and Office Manager only.</Banner>}

      <div className="grid grid-cols-1 gap-4 2xl:grid-cols-[minmax(0,1fr)_340px] [&>*]:min-w-0">
        <div className="space-y-4">
          <Card className="p-5" data-tour="qr-current">
            <CardLabel icon={<Link2 />} right={active && <Badge tone="green">Active</Badge>}>Current link</CardLabel>
            {!active ? (
              <EmptyState
                className="mt-4"
                icon={<QrCode />}
                title="No active link for this ownership period"
                body={history.length ? "The previous link was revoked. Generate a new one for the current owner." : "Generate a link, then send it or hand over the printed card."}
                action={canGen && <Button variant="primary" onClick={gen}><Plus className="h-4 w-4" /> Generate Link</Button>}
              />
            ) : (
              <div className="mt-4 flex flex-col gap-5 md:flex-row">
                <div className="flex shrink-0 flex-col items-center gap-2">
                  <div className="rounded-xl border border-line bg-white p-3"><QRCodeSVG value={recordUrl(active.ref)} size={132} level="M" title="Customer record QR code" /></div>
                  <a href={hrefFor(`/paint-record/view/?token=${active.ref}`)} target="_blank" rel="noreferrer" className="w-full">
                    <Button variant="dark" className="w-full justify-center"><ExternalLink className="h-4 w-4" /> Open customer page</Button>
                  </a>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="rounded-md bg-gray-100 px-2 py-1 font-mono text-sm font-semibold text-ink">{active.ref}</code>
                    <Button size="sm" onClick={() => copy(active.ref)}><Copy className="h-3.5 w-3.5" /> Copy link</Button>
                    {canRevoke && <Button size="sm" onClick={() => setRegen(true)}><RefreshCw className="h-3.5 w-3.5" /> Regenerate</Button>}
                    {canRevoke && <Button size="sm" onClick={() => setReplace(true)}><PhoneCall className="h-3.5 w-3.5" /> Replace for caller</Button>}
                  </div>
                  <p className="mt-1 text-xs text-gray-500">Random reference, not derived from the address or {property.id}. Active links are not rotated, so printed cards keep working.</p>
                  <KV
                    className="mt-4"
                    items={[
                      ["Ownership period", periodLabel(db, period)],
                      ["Generated", `${dateLong(active.createdAt)} by ${byId(db.users, active.createdBy)?.name}`],
                      ["Contact verification", owner?.contactVerified ? <Badge tone="green" icon={<BadgeCheck className="h-3 w-3" />}>Verified{owner.contactVerifiedAt ? ` ${dateLong(owner.contactVerifiedAt)}` : ""}</Badge> : <Badge tone="amber">Not verified</Badge>],
                      ["Last sent", active.lastSentAt ? `${dateTime(active.lastSentAt)} to ${active.lastSentTo} (${titleCase(active.lastSentChannel ?? "email")})` : "Not sent yet"],
                      ["Last send result", active.lastSentResult ? <Badge tone={active.lastSentResult === "delivered" ? "green" : "red"}>{titleCase(active.lastSentResult)}</Badge> : "—"],
                      ["Opens", `${active.openCount} (scans and direct opens)`],
                      ["Last open", active.lastOpenAt ? dateTime(active.lastOpenAt) : "Never opened"],
                    ]}
                  />
                  {active.verificationNotes && <p className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">Replacement link. Verification: {active.verificationNotes}</p>}
                </div>
              </div>
            )}
          </Card>

          <PhotoPanel property={property} />
          <div data-tour="touchup-panel">
            <TouchUpPanel property={property} />
          </div>
        </div>

        <div className="space-y-4">
          <Card className="p-5">
            <CardLabel icon={<BadgeCheck />}>Customer contact</CardLabel>
            <div className="mt-3 text-sm font-semibold text-ink">{owner?.name ?? "—"}</div>
            <div className="mt-1 space-y-0.5 text-xs text-gray-600">
              <div className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5 text-gray-400" /> {owner?.email ?? <span className="italic text-gray-400">No email — printed card and posted PDF</span>}</div>
              <div className="flex items-center gap-1.5"><MessageSquare className="h-3.5 w-3.5 text-gray-400" /> {owner?.phone ?? <span className="italic text-gray-400">No phone</span>}</div>
            </div>
            <div className="mt-3">{owner?.contactVerified ? <Badge tone="green">Verified by {byId(db.users, owner.contactVerifiedBy)?.name ?? "the office"}</Badge> : <Badge tone="amber">Not verified — the link can&apos;t be sent yet</Badge>}</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {!owner?.contactVerified && can(user, "qr.verifyContact") && owner && (
                <Button size="sm" variant="primary" onClick={() => act(verifyContact, property.id, owner.id).ok && toast.success("Contact verified", "Estimators can now send without re-verifying.")}>
                  <BadgeCheck className="h-3.5 w-3.5" /> Mark verified
                </Button>
              )}
              {canGen && owner && <Button size="sm" onClick={() => setContact(true)}>Edit contact</Button>}
            </div>
            <p className="mt-2 text-xs text-gray-500">Changing the email or phone resets verification.</p>
          </Card>

          <Card className="p-5" data-tour="qr-history">
            <CardLabel icon={<History />}>Link history</CardLabel>
            <div className="mt-3 space-y-2">
              {history.length === 0 && <EmptyState title="No previous links" />}
              {history.map((l) => {
                const per = property.ownership.find((o) => o.id === l.ownershipPeriodId);
                return (
                  <div key={l.id} className="rounded-lg border border-line px-3 py-2 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <code className="font-mono text-xs text-gray-500 line-through">{l.ref}</code>
                      <Badge tone={l.revokeReason?.startsWith("Sale") ? "purple" : "gray"}>{l.revokeReason?.startsWith("Sale") ? "Superseded by sale" : "Revoked"}</Badge>
                    </div>
                    <div className="mt-1 text-gray-500">
                      {per ? periodLabel(db, per) : l.ownershipPeriodId}
                      <br />
                      Revoked {dateLong(l.revokedAt)} · {l.revokeReason} · {l.openCount} opens
                    </div>
                    <a href={hrefFor(`/paint-record/view/?token=${l.ref}`)} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline">
                      <Eye className="h-3 w-3" /> See what the old code shows
                    </a>
                  </div>
                );
              })}
            </div>
          </Card>

          {active && (
            <Card className="p-5">
              <CardLabel icon={<Eye />}>Open analytics</CardLabel>
              <p className="mt-1 text-xs text-gray-500">Link reference, date and coarse device type only. No IP address, location or personal identifier.</p>
              <StatStrip className="mt-3 border-0 p-0 shadow-none">
                <Stat label="Opens" value={active.openCount} />
                <Stat label="Last open" value={<span className="text-sm">{active.lastOpenAt ? dateLong(active.lastOpenAt) : "—"}</span>} />
              </StatStrip>
              <div className="mt-3 space-y-1">
                {(active.opens ?? []).slice(0, 6).map((o, i) => (
                  <div key={i} className="flex justify-between text-xs text-gray-600"><span>{dateTime(o.at)}</span><span className="capitalize text-gray-500">{o.device}</span></div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>

      <PrintQrModal format={print} link={active} property={property} onClose={() => setPrint(undefined)} />
      <SendModal open={send} onClose={() => setSend(false)} link={active} />
      <RevokeModal open={revoke} onClose={() => setRevoke(false)} link={active} />
      <RegenerateModal open={regen} onClose={() => setRegen(false)} property={property} />
      <ReplaceModal open={replace} onClose={() => setReplace(false)} property={property} />
      {owner && <ContactModal open={contact} onClose={() => setContact(false)} property={property} customerId={owner.id} />}
    </>
  );
}

/* ------------------------------ Modals ------------------------------ */

function SendModal({ open, onClose, link }: { open: boolean; onClose: () => void; link?: QrLink }) {
  const db = useDb((d) => d);
  const [channel, setChannel] = useState<"email" | "text">("email");
  if (!link) return null;
  const property = byId(db.properties, link.propertyId)!;
  const owner = byId(db.customers, property.ownership.find((o) => o.id === link.ownershipPeriodId)?.customerId);
  const recipient = channel === "email" ? owner?.email : owner?.phone;
  const doSend = () => {
    const res = act(sendLink, link.id, channel);
    if (res.ok) {
      toast.success("Link sent", `Delivered to ${res.value}.`);
      onClose();
    }
  };
  return (
    <Modal open={open} onOpenChange={(v) => !v && onClose()} size="sm" title="Send QR record link" description="QR record delivery is on the closed list of customer messages (Rule 4). You are the person pressing send." footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={doSend} disabled={!owner?.contactVerified || !recipient}><Send className="h-4 w-4" /> Send now</Button></>}>
      <div className="space-y-3">
        {!owner?.contactVerified && <Banner tone="warn" title="Contact not verified">The office must verify {owner?.name}&apos;s email or phone first. Once verified, an estimator can send without re-verifying.</Banner>}
        <Field label="Send by">
          <Select value={channel} onChange={(e) => setChannel(e.target.value as "email" | "text")}>
            <option value="email">Email</option>
            <option value="text">Text message</option>
          </Select>
        </Field>
        <div className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-700">
          To: <strong>{recipient ?? "nothing on file"}</strong>
          <p className="mt-2 text-gray-600">&ldquo;Hi {owner?.name?.split(" ")[0]}, here is the paint record for {property.address}: {recordUrl(link.ref)} — {`Estimate Master Painting`}&rdquo;</p>
        </div>
      </div>
    </Modal>
  );
}

function RevokeModal({ open, onClose, link }: { open: boolean; onClose: () => void; link?: QrLink }) {
  const [reason, setReason] = useState<"Sale" | "Other">("Other");
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string>();
  const [confirm, setConfirm] = useState(false);
  if (!link) return null;
  const run = () => {
    const res = act(revokeLink, link.id, reason, note);
    if (!res.ok) return setErr(res.error);
    toast.success("Link revoked", "The printed code now shows “Record has moved” and the business phone number.");
    setNote("");
    setErr(undefined);
    onClose();
  };
  return (
    <>
      <Modal
        open={open}
        onOpenChange={(v) => !v && onClose()}
        size="sm"
        title="Revoke link"
        description="Revocation is immediate. The reference never returns history again and can't be reused. For a sale, use Record ownership change so the buyer gets a new link."
        footer={<><Button onClick={onClose}>Cancel</Button><Button variant="dark" className="bg-red-600 hover:bg-red-700" onClick={() => (reason === "Other" && !note.trim() ? setErr("Describe the reason for revoking.") : setConfirm(true))}>Revoke link</Button></>}
      >
        <div className="space-y-3">
          <Field label="Reason" required>
            <Select value={reason} onChange={(e) => setReason(e.target.value as "Sale" | "Other")}><option>Other</option><option>Sale</option></Select>
          </Field>
          <Field label="Note" required={reason === "Other"} error={err}>
            <Textarea value={note} invalid={!!err} onChange={(e) => setNote(e.target.value)} placeholder="Card lost; customer asked for the old code to stop working." />
          </Field>
        </div>
      </Modal>
      <ConfirmDialog open={confirm} onOpenChange={setConfirm} title={`Revoke ${link.ref}?`} body="Anyone scanning the old card will see only “Record has moved” and the business phone number." confirmLabel="Revoke" onConfirm={run} />
    </>
  );
}

function RegenerateModal({ open, onClose, property }: { open: boolean; onClose: () => void; property: Property }) {
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string>();
  const run = () => {
    const res = act(regenerateLink, property.id, reason);
    if (!res.ok) return setErr(res.error);
    toast.success("Link regenerated", `New reference ${res.value}. The old printed card no longer works.`);
    setReason("");
    onClose();
  };
  return (
    <Modal open={open} onOpenChange={(v) => !v && onClose()} size="sm" title="Regenerate link" description="Revokes the current link and issues a new one for the same ownership period. The customer's printed card stops working." footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={run}>Regenerate</Button></>}>
      <Field label="Reason" required error={err}><Textarea value={reason} invalid={!!err} onChange={(e) => setReason(e.target.value)} /></Field>
    </Modal>
  );
}

function ContactModal({ open, onClose, property, customerId }: { open: boolean; onClose: () => void; property: Property; customerId: string }) {
  const db = useDb((d) => d);
  const c = byId(db.customers, customerId)!;
  const [f, setF] = useState({ email: c.email ?? "", phone: c.phone ?? "" });
  const [errors, setErrors] = useState<Errors>({});
  const save = () => {
    const res = act(updateContact, property.id, customerId, f);
    if (!res.ok) return setErrors({ [res.field ?? "email"]: res.error });
    toast.success(res.value ? "Contact updated — verification reset" : "No changes", res.value ? "The office must verify the new details before the link is sent." : undefined);
    onClose();
  };
  return (
    <Modal open={open} onOpenChange={(v) => !v && onClose()} size="sm" title={`Contact for ${c.name}`} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>Save</Button></>}>
      <div className="space-y-3">
        <Field label="Email" error={errors.email}><Input type="email" value={f.email} invalid={!!errors.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Phone"><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <Banner tone="warn">Any change resets verification.</Banner>
      </div>
    </Modal>
  );
}

function ReplaceModal({ open, onClose, property }: { open: boolean; onClose: () => void; property: Property }) {
  const [f, setF] = useState({ address: false, contractName: "", jobYear: "", colourOrRoom: "" });
  const [result, setResult] = useState<{ passed: boolean; matched: string[]; ref: string; deliveredTo: string }>();
  const provided = [f.contractName, f.jobYear, f.colourOrRoom].filter((x) => x.trim()).length;
  const run = () => {
    const res = act(reissueAfterVerification, property.id, { addressMatches: f.address, contractName: f.contractName, jobYear: f.jobYear, colourOrRoom: f.colourOrRoom });
    if (res.ok && res.value) {
      setResult(res.value);
      toast.success(res.value.passed ? "Caller verified — replacement issued" : "Verification failed — sent to contact on file", `New reference ${res.value.ref}.`);
    }
  };
  const close = () => {
    setF({ address: false, contractName: "", jobYear: "", colourOrRoom: "" });
    setResult(undefined);
    onClose();
  };
  return (
    <Modal
      open={open}
      onOpenChange={(v) => !v && close()}
      title="Replacement link for a caller"
      description="26.Q01: the caller gives the property address plus two of — the name on the original contract, the approximate job year, a colour or room from the record. You record what they said; the system checks it."
      footer={result ? <Button variant="primary" onClick={close}>Done</Button> : <><Button onClick={close}>Cancel</Button><Button variant="primary" onClick={run}><ShieldAlert className="h-4 w-4" /> Verify and issue</Button></>}
    >
      {result ? (
        <div className="space-y-3">
          <Banner tone={result.passed ? "success" : "warn"} title={result.passed ? "Verification passed" : "Verification failed"}>
            {result.passed ? `Matched ${result.matched.join(" and ")}. Replacement link ${result.ref} issued to the caller and logged.` : `Matched ${result.matched.length ? result.matched.join(", ") : "nothing"} beyond the address. The replacement was not given to the caller. It went to ${result.deliveredTo}.`}
          </Banner>
          <p className="text-xs text-gray-500">The previous link is revoked. Customers with no email receive a printed card and a posted PDF at the address on file.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <Checkbox checked={f.address} onCheckedChange={(v) => setF({ ...f, address: v })} label={<span>Caller gave the address: <strong>{propertyAddress(property, true)}</strong></span>} />
          <Field label="Name on the original contract"><Input value={f.contractName} onChange={(e) => setF({ ...f, contractName: e.target.value })} /></Field>
          <Field label="Approximate job date or year"><Input value={f.jobYear} onChange={(e) => setF({ ...f, jobYear: e.target.value })} placeholder="e.g. summer 2023" /></Field>
          <Field label="A colour or room from the record"><Input value={f.colourOrRoom} onChange={(e) => setF({ ...f, colourOrRoom: e.target.value })} placeholder="e.g. Repose Gray, or the living room" /></Field>
          <p className="text-xs text-gray-500">{provided} of 3 further details entered. Two must match.</p>
        </div>
      )}
    </Modal>
  );
}

/* ------------------------------ Panels ------------------------------ */

function PhotoPanel({ property }: { property: Property }) {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const photos = (db.sharedPhotos ?? []).filter((p) => p.propertyId === property.id && !p.deletedAt);
  const [approving, setApproving] = useState<string>();
  const [release, setRelease] = useState("");
  const [err, setErr] = useState<string>();
  const canSelect = can(user, "qr.selectPhotos");
  return (
    <Card className="p-5">
      <CardLabel icon={<Camera />}>Photographs on the customer page</CardLabel>
      <p className="mt-1 text-xs text-gray-500">The office selects photos. Any photo with faces, house numbers, licence plates or a neighbouring property needs the Business Owner&apos;s approval and a job-linked signed release. Without a release, only surface images appear.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {photos.length === 0 && <EmptyState className="sm:col-span-3" icon={<ImageIcon />} title="No job photographs" body="Photos attached at closeout appear here." />}
        {photos.map((p) => {
          const shared = photoShareable(p);
          return (
            <div key={p.id} className="rounded-xl border border-line p-3">
              <div className="flex h-24 items-center justify-center rounded-lg bg-gradient-to-br from-gray-100 to-gray-200 text-gray-400" role="img" aria-label={p.caption}><ImageIcon className="h-6 w-6" /></div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5"><IdChip>{p.id}</IdChip>{p.identifying && <Badge tone="red">{p.identifyingReason ?? "Identifying"}</Badge>}</div>
              <div className="mt-1 text-xs font-medium text-ink">{p.caption}</div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <Checkbox checked={p.selected} disabled={!canSelect} onCheckedChange={(v) => act(selectPhoto, p.id, v).ok && toast.success(v ? "Selected for sharing" : "Removed from sharing")} label={<span className="text-xs">Select</span>} />
                {shared ? <Badge tone="green">Shown</Badge> : p.selected ? <Badge tone="amber">Needs approval</Badge> : <Badge tone="gray">Not shared</Badge>}
              </div>
              {p.identifying && (
                <div className="mt-2 text-xs text-gray-500">
                  {p.ownerApprovedBy ? `Approved by ${byId(db.users, p.ownerApprovedBy)?.name} · Release ${p.releaseRef}` : (
                    <Button size="sm" className="mt-1 w-full justify-center" onClick={() => { setApproving(p.id); setRelease(""); setErr(undefined); }}>Owner approval…</Button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <Modal
        open={!!approving}
        onOpenChange={(v) => !v && setApproving(undefined)}
        size="sm"
        title={`Approve ${approving} for sharing`}
        description="Business Owner only. Record the job-linked signed release."
        footer={<><Button onClick={() => setApproving(undefined)}>Cancel</Button><Button variant="primary" onClick={() => {
          const res = act(approvePhoto, approving!, release);
          if (!res.ok) return setErr(res.field ? res.error : undefined);
          toast.success("Photograph approved", "It now appears on the customer page if selected.");
          setApproving(undefined);
        }}>Approve</Button></>}
      >
        <Field label="Signed release reference" required error={err}><Input value={release} invalid={!!err} onChange={(e) => setRelease(e.target.value)} placeholder="REL-JOB-2023-21-01" /></Field>
      </Modal>
    </Card>
  );
}

function TouchUpPanel({ property }: { property: Property }) {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const reqs = db.touchUpRequests.filter((r) => r.propertyId === property.id);
  return (
    <Card className="p-5">
      <CardLabel icon={<PaintBucket />}>Touch-up requests</CardLabel>
      <p className="mt-1 text-xs text-gray-500">Submitted from the customer page. The customer received the automatic acknowledgment; nothing was approved or promised.</p>
      <div className="mt-3 space-y-2">
        {reqs.length === 0 && <EmptyState icon={<PaintBucket />} title="No touch-up requests" />}
        {reqs.map((r) => (
          <div key={r.id} className="flex flex-col gap-2 rounded-lg border border-line px-3 py-2.5 text-xs sm:flex-row sm:items-start">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <IdChip>{r.id}</IdChip>
                <span className="font-semibold text-ink">{r.requesterName}</span>
                <span className="text-gray-500">{r.contact}</span>
                <Badge tone={TOUCHUP_STATUS[r.status].tone}>{TOUCHUP_STATUS[r.status].label}</Badge>
              </div>
              <div className="mt-1 text-gray-600">{r.surfaceId ? surfaceLabel(db, r.surfaceId) : "No surface chosen"}{r.colourLabel ? ` · ${r.colourLabel}` : ""}</div>
              {r.note && <div className="mt-0.5 italic text-gray-500">&ldquo;{r.note}&rdquo;</div>}
              <div className="mt-0.5 text-xs text-gray-400">{dateTime(r.createdAt)} · via link {r.linkRef.slice(0, 6)}…</div>
            </div>
            <Select
              aria-label={`Status of ${r.id}`}
              value={r.status}
              disabled={!can(user, "qr.touchUps")}
              onChange={(e) => act(setTouchUpStatus, r.id, e.target.value as typeof r.status).ok && toast.success("Request updated", TOUCHUP_STATUS[e.target.value].label)}
              className="h-8 w-full py-0 text-xs sm:w-44"
            >
              {Object.entries(TOUCHUP_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </Select>
          </div>
        ))}
      </div>
    </Card>
  );
}
