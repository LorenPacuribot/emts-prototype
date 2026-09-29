"use client";
/** Component 3.4 — Approval and Evidence Panel. */
import { useEffect, useState } from "react";
import { FileCheck2, Mail, Send } from "lucide-react";
import type { ApprovalChannel, ColourApproval } from "@/features/types";
import { act, useDb } from "@/features/lib/store";
import { approvalGaps, recordCustomerApproval, sendForApproval } from "@/features/lib/store/actions/color-card";
import { byId } from "@/features/lib/selectors";
import { dateTime } from "@/features/lib/format";
import { userName } from "@/features/lib/store/helpers";
import { toast } from "@/features/lib/toast";
import { Badge, Banner, Button, Card, CardLabel, Checkbox, EmptyState, Field, Input, KV, Modal, Select, Swatch } from "@/features/components/ui";
import { CHANNEL_LABEL } from "./constants";

export function ApprovalPanel({ jobId }: { jobId: string }) {
  const db = useDb((d) => d);
  const approvals = db.colourApprovals.filter((a) => a.jobId === jobId).sort((a, b) => b.sentAt.localeCompare(a.sentAt));
  const [replyFor, setReplyFor] = useState<ColourApproval>();
  const [evidence, setEvidence] = useState<ColourApproval>();

  return (
    <Card className="p-5">
      <CardLabel icon={<FileCheck2 />}>Approval & evidence</CardLabel>
      <div className="mt-4 space-y-3">
        {approvals.length === 0 && <EmptyState title="Nothing sent for approval yet." body="Use Send for approval to send one or more specifications." />}
        {approvals.map((a) => (
          <div key={a.id} className="rounded-xl border border-line p-3 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold text-ink">{a.id}</span>
              <Badge tone={a.status === "approved" ? "green" : "blue"}>{a.status === "approved" ? "Approved" : "Awaiting reply"}</Badge>
              <span className="text-gray-500">v{a.cardVersion}</span>
              <span className="text-gray-500">· {CHANNEL_LABEL[a.channel]}</span>
            </div>
            <div className="mt-1 text-gray-600">Specifications: {a.specIds.join(", ")}</div>
            <div className="mt-1 text-gray-500">
              {a.status === "approved" ? `Signed by ${a.signer} · ${dateTime(a.approvedAt)}` : `Sent ${dateTime(a.sentAt)} by ${userName(db, a.sentBy)}`}
            </div>
            <div className="mt-2 flex gap-2">
              {a.status === "sent" && (
                <Button size="sm" variant="primary" onClick={() => setReplyFor(a)}>
                  Record customer reply
                </Button>
              )}
              {a.status === "approved" && (
                <Button size="sm" onClick={() => setEvidence(a)}>
                  View evidence
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
      <RecordReplyModal approval={replyFor} onClose={() => setReplyFor(undefined)} />
      <Modal open={!!evidence} onOpenChange={(v) => !v && setEvidence(undefined)} title={`Approval evidence ${evidence?.id ?? ""}`} description="Stored against the job. A later card version does not inherit this signature.">
        {evidence && (
          <KV
            items={[
              ["Card version", `v${evidence.cardVersion}`],
              ["Specifications", evidence.specIds.join(", ")],
              ["Channel", CHANNEL_LABEL[evidence.channel]],
              ["Signer", evidence.signer],
              ["Timestamp", dateTime(evidence.approvedAt)],
              ["Sender address", evidence.senderAddress],
              ["Sent by", userName(db, evidence.sentBy)],
            ]}
          />
        )}
      </Modal>
    </Card>
  );
}

function RecordReplyModal({ approval, onClose }: { approval?: ColourApproval; onClose: () => void }) {
  const db = useDb((d) => d);
  const [signer, setSigner] = useState("");
  const [address, setAddress] = useState("");
  const [picked, setPicked] = useState<string[]>([]);

  useEffect(() => {
    if (!approval) return;
    const job = byId(db.jobs, approval.jobId);
    const customer = byId(db.customers, job?.customerId);
    setSigner(customer?.name ?? "");
    setAddress(customer?.email ?? "");
    setPicked(approval.specIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approval?.id]);

  return (
    <Modal
      open={!!approval}
      onOpenChange={(v) => !v && onClose()}
      title="Record customer reply"
      description="Tick only what the customer approved. Anything not ticked stays awaiting approval."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="success"
            onClick={() => {
              const res = act(recordCustomerApproval, approval!.id, { signer, approvedSpecIds: picked, senderAddress: address });
              if (res.ok) {
                toast.success("Approval recorded", `${picked.length} specification(s) approved`);
                onClose();
              }
            }}
          >
            Record approval
          </Button>
        </>
      }
    >
      {approval && (
        <div className="space-y-4">
          <div className="space-y-2">
            {approval.specIds.map((id) => {
              const spec = byId(db.specs, id);
              const colour = spec && byId(db.colours, spec.colourId);
              return (
                <Checkbox
                  key={id}
                  checked={picked.includes(id)}
                  onCheckedChange={(v) => setPicked(v ? [...picked, id] : picked.filter((x) => x !== id))}
                  label={
                    <span className="flex items-center gap-2">
                      {colour && <Swatch hex={colour.hex} size="sm" />} {id} · {colour?.name} · {spec?.sheen}
                    </span>
                  }
                />
              );
            })}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Signer" required htmlFor="rr-signer">
              <Input id="rr-signer" value={signer} onChange={(e) => setSigner(e.target.value)} />
            </Field>
            <Field label="Sender address" required htmlFor="rr-addr" hint="Email or portal account the reply came from.">
              <Input id="rr-addr" value={address} onChange={(e) => setAddress(e.target.value)} />
            </Field>
          </div>
          <Banner tone="info">Verbal approval is not accepted and is not offered as a channel.</Banner>
        </div>
      )}
    </Modal>
  );
}

export function SendApprovalModal({ open, onOpenChange, jobId, preselect }: { open: boolean; onOpenChange: (v: boolean) => void; jobId: string; preselect?: string }) {
  const db = useDb((d) => d);
  const candidates = db.specs.filter((s) => s.jobId === jobId && (s.state === "draft" || s.state === "pending_sample"));
  const [picked, setPicked] = useState<string[]>([]);
  const [channel, setChannel] = useState<ApprovalChannel>("email");

  useEffect(() => {
    if (open) setPicked(preselect ? [preselect] : candidates.filter((s) => approvalGaps(s).length === 0 && s.state === "draft").map((s) => s.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, preselect]);

  const valid = picked.length > 0 && picked.every((id) => {
    const s = byId(db.specs, id);
    return s && s.state === "draft" && approvalGaps(s).length === 0;
  });

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Send for approval"
      description="Choose the specifications and how to send them. Nothing goes out until you press send."
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!valid}
            onClick={() => {
              const res = act(sendForApproval, jobId, picked, channel);
              if (res.ok) {
                toast.success("Sent for approval", `${picked.length} specification(s) via ${CHANNEL_LABEL[channel]}`);
                onOpenChange(false);
              }
            }}
          >
            <Send className="h-4 w-4" /> Send
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {candidates.length === 0 ? (
          <EmptyState title="No draft specifications to send." body="Approved or already-sent specifications are not listed." />
        ) : (
          <div className="space-y-2">
            {candidates.map((s) => {
              const colour = byId(db.colours, s.colourId);
              const gaps = approvalGaps(s);
              const blocked = s.state === "pending_sample" ? "Waiting on custom sample" : gaps[0]?.message;
              return (
                <div key={s.id} className="rounded-lg border border-line px-3 py-2">
                  <Checkbox
                    checked={picked.includes(s.id)}
                    onCheckedChange={(v) => setPicked(v ? [...picked, s.id] : picked.filter((x) => x !== s.id))}
                    label={
                      <span className="flex items-center gap-2">
                        {colour && <Swatch hex={colour.hex} size="sm" />}
                        <span className="font-medium">{s.id}</span> · {colour?.name} · {s.sheen ?? "no sheen"}
                      </span>
                    }
                  />
                  {blocked && picked.includes(s.id) && <p className="mt-1 pl-6 text-xs font-medium text-red-600">{blocked}</p>}
                  {blocked && !picked.includes(s.id) && <p className="mt-1 pl-6 text-xs text-gray-500">{blocked}</p>}
                </div>
              );
            })}
          </div>
        )}
        <Field label="Channel" htmlFor="sa-channel">
          <Select id="sa-channel" value={channel} onChange={(e) => setChannel(e.target.value as ApprovalChannel)}>
            {(Object.keys(CHANNEL_LABEL) as ApprovalChannel[]).map((c) => (
              <option key={c} value={c}>
                {CHANNEL_LABEL[c]}
              </option>
            ))}
          </Select>
        </Field>
        <p className="flex items-center gap-1.5 text-xs text-gray-500">
          <Mail className="h-3.5 w-3.5" /> The prototype records the send; no real email leaves the browser.
        </p>
      </div>
    </Modal>
  );
}
