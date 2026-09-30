"use client";
/**
 * Estimate toolbar (live: estimates/details/components/project-toolbar.tsx).
 *
 * Existing: PROJECT NAME, the #number / status / lead / "Amendment #N" chips,
 * Mark Approved, Amend Estimate (PopConfirm), Edit Amendment Again, Save,
 * Send / Send for Re-approval, and the kebab (Client Preview, Delete).
 * NEW (feature 24): "+ Create Change Order" beside Amend Estimate, and the
 * rule that Amend stops once the work order is In Progress (decision D4).
 */
import { useState } from "react";
import { CheckCircle2, ExternalLink, FilePlus2, History, Info, MoreVertical, PencilLine, Send, Trash2 } from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import type { Estimate, Job } from "@/features/types";
import { act, useCurrentUser, useDb } from "@/features/lib/store";
import { amendEstimate, deleteEstimate, markEstimateApproved, saveEstimate, sendEstimate, sendForReapproval, updateEstimateDetails } from "@/features/lib/store/actions/estimates";
import { amendBlockedReason, changeOrderAllowed, ESTIMATE_STATUS_LABEL, ESTIMATE_STATUS_TONE, isEditable } from "@/features/lib/rules/estimate-lifecycle";
import { can } from "@/features/lib/permissions";
import { AppLink, hrefFor, useNav } from "@/features/lib/navigation";
import { estimateHistoryHref, leadHref, publicEstimateHref } from "@/features/lib/hrefs";
import { dateTime } from "@/features/lib/format";
import { toast } from "@/features/lib/toast";
import { Button, ConfirmDialog, NewBadge, NumberChip, StatusPill, Tooltip } from "@/features/components/ui";

export function ProjectToolbar({ estimate, job, onCreateChangeOrder }: { estimate: Estimate; job?: Job; onCreateChangeOrder: () => void }) {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const nav = useNav();
  const [confirm, setConfirm] = useState<"amend" | "reapprove" | "delete">();
  const editable = isEditable(estimate.status);
  const wo = job && db.workOrders.find((w) => w.jobId === job.id);
  const amendBlock = amendBlockedReason(estimate, wo?.status);
  const customer = db.customers.find((c) => c.id === estimate.customerId);
  const canSend = can(user, "estimate.send");
  const canAmend = can(user, "estimate.amend");

  function run(r: { ok: boolean }, message: string, body?: string) {
    if (r.ok) toast.success(message, body);
  }

  return (
    <div className="mb-4 flex flex-col gap-4 md:mb-6 lg:flex-row lg:items-end lg:justify-between" data-tour="estimate-toolbar">
      <div className="min-w-0 flex-1">
        <div className="mb-1 text-xxs font-bold uppercase tracking-widest text-gray-500">
          Project Name {editable && <span className="normal-case tracking-normal text-gray-300">(Click to edit)</span>}
        </div>
        {editable ? (
          <input
            defaultValue={estimate.title}
            key={estimate.title}
            onBlur={(e) => e.target.value.trim() !== estimate.title && act(updateEstimateDetails, estimate.id, { title: e.target.value })}
            placeholder="Enter Project Name"
            className="w-full bg-transparent font-heading text-2xl font-extrabold tracking-tight text-gray-900 outline-none focus:border-b-2 focus:border-primary-500 md:text-3xl"
            aria-label="Project name"
          />
        ) : (
          <h1 className="font-heading text-2xl font-extrabold tracking-tight text-gray-900 md:text-3xl">{estimate.title}</h1>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <NumberChip>#{estimate.id}</NumberChip>
          <StatusPill tone={ESTIMATE_STATUS_TONE[estimate.status]}>{ESTIMATE_STATUS_LABEL[estimate.status]}</StatusPill>
          {(estimate.status === "AMENDED_DRAFT" || estimate.status === "PENDING_REAPPROVAL") && (
            <Tooltip content={<AmendmentInfo estimate={estimate} email={customer?.email} />}>
              <Info className="h-4 w-4 cursor-help text-amber-600" aria-label="Amendment status" />
            </Tooltip>
          )}
          {estimate.leadId && (
            <AppLink href={leadHref(estimate.leadId)} className="rounded-md border border-primary-100 bg-primary-50 px-2 py-0.5 text-xs font-bold text-primary-700 hover:bg-primary-100">
              {estimate.leadId}
            </AppLink>
          )}
          {(estimate.amendmentNumber ?? 0) > 0 && <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-700">Amendment #{estimate.amendmentNumber}</span>}
        </div>
      </div>

      <div className="no-print flex flex-wrap items-center gap-2">
        {/* read-only states */}
        {!editable && (estimate.status === "SENT" || estimate.status === "VIEWED") && canSend && (
          <Tooltip content="Mark as approved without sending to the client">
            <Button className="h-11 px-5 font-black" onClick={() => run(act(markEstimateApproved, estimate.id), "Estimate approved successfully", "Job, work order and draft invoice created.")}>
              <CheckCircle2 className="h-4 w-4" /> Mark Approved
            </Button>
          </Tooltip>
        )}
        {estimate.status === "ACCEPTED" && canAmend && (
          <Tooltip content={amendBlock ?? "Open this accepted estimate for editing"}>
            <span>
              <Button className="h-11 px-5 font-black" disabled={!!amendBlock} onClick={() => setConfirm("amend")} data-tour="amend-button">
                <PencilLine className="h-4 w-4" /> Amend Estimate
              </Button>
            </span>
          </Tooltip>
        )}
        {job && changeOrderAllowed(estimate) && can(user, "co.build") && (
          <Button variant="primary" className="h-11 px-5 font-black shadow-lg shadow-primary-500/20" onClick={onCreateChangeOrder} data-tour="create-change-order">
            <FilePlus2 className="h-4 w-4" /> Create Change Order <NewBadge feature={24} className="ml-1 bg-white/90 text-green-700" />
          </Button>
        )}
        {estimate.status === "PENDING_REAPPROVAL" && canAmend && (
          <Button className="h-11 px-5 font-black" onClick={() => run(act(amendEstimate, estimate.id), "Estimate opened for editing")}>
            <PencilLine className="h-4 w-4" /> Edit Amendment Again
          </Button>
        )}

        {/* editable states */}
        {editable && can(user, "estimate.edit") && (
          <Button className="h-11 px-5 font-black" onClick={() => run(act(saveEstimate, estimate.id), "Estimate saved")}>
            Save
          </Button>
        )}
        {estimate.status === "DRAFT" && canSend && (
          <Tooltip content="Mark as approved without sending to the client">
            <Button className="h-11 px-5 font-black" onClick={() => run(act(markEstimateApproved, estimate.id), "Estimate approved successfully", "Job, work order and draft invoice created.")}>
              <CheckCircle2 className="h-4 w-4" /> Mark Approved
            </Button>
          </Tooltip>
        )}
        {estimate.status === "AMENDED_DRAFT" && canAmend && (
          <Button variant="primary" className="h-11 px-5 font-black shadow-lg shadow-primary-500/20" onClick={() => setConfirm("reapprove")}>
            <Send className="h-4 w-4" /> Send for Re-approval
          </Button>
        )}
        {estimate.status === "DRAFT" && canSend && (
          <Button variant="primary" className="h-11 px-5 font-black shadow-lg shadow-primary-500/20" onClick={() => run(act(sendEstimate, estimate.id), "Estimate sent", "Email and SMS recorded (not sent: prototype).")} data-tour="send-estimate">
            <Send className="h-4 w-4" /> Send
          </Button>
        )}

        <DropdownMenu.Root>
          <DropdownMenu.Trigger className="flex h-11 w-11 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50" aria-label="More">
            <MoreVertical className="h-4 w-4" />
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content align="end" sideOffset={6} className="z-50 min-w-48 rounded-xl border border-gray-200 bg-white p-1 shadow-xl">
              {estimate.publicToken && (
                <DropdownMenu.Item onSelect={() => window.open(hrefFor(publicEstimateHref(estimate.publicToken!)), "_blank")} className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm outline-none data-[highlighted]:bg-gray-100">
                  <ExternalLink className="h-4 w-4" /> Client Preview
                </DropdownMenu.Item>
              )}
              <DropdownMenu.Item onSelect={() => nav.push(estimateHistoryHref(estimate.id))} className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm outline-none data-[highlighted]:bg-gray-100">
                <History className="h-4 w-4" /> History
              </DropdownMenu.Item>
              {estimate.status === "DRAFT" && can(user, "estimate.delete") && (
                <DropdownMenu.Item onSelect={() => setConfirm("delete")} className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-600 outline-none data-[highlighted]:bg-red-50">
                  <Trash2 className="h-4 w-4" /> Delete
                </DropdownMenu.Item>
              )}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>

      <ConfirmDialog
        open={confirm === "amend"}
        onOpenChange={(v) => !v && setConfirm(undefined)}
        tone="primary"
        title="Amend Estimate"
        body="Open this accepted estimate for editing? The customer will not be notified until you click 'Send for re-approval'."
        confirmLabel="Open for Editing"
        onConfirm={() => run(act(amendEstimate, estimate.id), "Estimate opened for editing", 'Customer will not be notified until you click "Send for re-approval".')}
      />
      <ConfirmDialog
        open={confirm === "reapprove"}
        onOpenChange={(v) => !v && setConfirm(undefined)}
        tone="primary"
        title="Send for Re-approval"
        body="Send the updated estimate to the customer? They will receive an email and SMS with a link to re-sign. The previous payment link will be invalidated."
        confirmLabel="Send"
        onConfirm={() => {
          if (act(saveEstimate, estimate.id).ok) run(act(sendForReapproval, estimate.id), "Amended estimate sent to customer for re-approval");
        }}
      />
      <ConfirmDialog
        open={confirm === "delete"}
        onOpenChange={(v) => !v && setConfirm(undefined)}
        title="Delete Estimate"
        body="Are you sure you want to delete this estimate? This action cannot be undone."
        confirmLabel="Delete"
        onConfirm={() => {
          if (act(deleteEstimate, estimate.id).ok) {
            toast.success("Estimate deleted");
            nav.push("/estimates");
          }
        }}
      />
    </div>
  );
}

/** Live AmendmentStatusInfo tooltip text. */
function AmendmentInfo({ estimate, email }: { estimate: Estimate; email?: string }) {
  if (estimate.status === "AMENDED_DRAFT") {
    return (
      <div className="max-w-xs space-y-1 text-left">
        <div className="font-bold">You&apos;re editing an accepted estimate (Amendment #{estimate.amendmentNumber})</div>
        <div>Changes won&apos;t reach the customer until you click &quot;Send for Re-approval&quot;. The previous payment link stays active until the customer re-signs.</div>
      </div>
    );
  }
  return (
    <div className="max-w-xs space-y-1 text-left">
      <div className="font-bold">Awaiting customer signature for amendment #{estimate.amendmentNumber}</div>
      <div>Customer received the updated estimate at {email} on {dateTime(estimate.sentAt)}.</div>
      <div>To make further changes, click &quot;Edit Amendment Again&quot;.</div>
    </div>
  );
}
