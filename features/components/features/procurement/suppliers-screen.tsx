"use client";
/**
 * Component 19.1 — Supplier and Branch Setup.
 * Menu: Procurement > Suppliers and Branches
 */
import { useState } from "react";
import { Building2, CalendarDays, FlaskConical, Pencil, Plug, Plus, Power, ShieldCheck } from "lucide-react";
import type { Branch, ConnectionHealth, Supplier, SupplierConnectionType } from "@/features/types";
import { act, useCurrentUser, useDb } from "@/features/lib/store";
import {
  CONNECTION_LABEL, branchCommitments, recordLiveCheck, saveBranch, saveSupplierConnection, setBranchActive, testSupplierConnection, type BranchDraft, type ConnectionDraft,
} from "@/features/lib/store/actions/supplier";
import { branchGaps } from "@/features/lib/rules/procurement";
import { envName } from "@/features/lib/integrations/supplier-connector";
import { fetchLiveStatus } from "@/features/lib/integrations/supplier-live";
import { US_HOLIDAYS } from "@/features/lib/rules/dates";
import { dateLong, dateTime } from "@/features/lib/format";
import { toast } from "@/features/lib/toast";
import { PageHeader } from "@/features/components/layout/screen";
import { Badge, Banner, Button, Card, CardLabel, ConfirmDialog, EmptyState, Field, Input, Modal, PillTabs, RowMenu, Select, Table, TD, TH, THead, TR } from "@/features/components/ui";
import { ProcurementFrame } from "./procurement-frame";
import { procurementPerms } from "./shared";
import { useErr } from "./order-modals";

export function SuppliersScreen() {
  return (
    <ProcurementFrame tab="suppliers">
      <Suppliers />
    </ProcurementFrame>
  );
}

function Suppliers() {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const perms = procurementPerms(user);
  const [edit, setEdit] = useState<{ open: boolean; branch?: Branch; supplierId?: string }>({ open: false });
  const [deactivate, setDeactivate] = useState<Branch>();
  const [conn, setConn] = useState<Supplier>();
  const holidays = Array.from(US_HOLIDAYS).filter((h) => h >= new Date().toISOString().slice(0, 10)).slice(0, 8);

  return (
    <>
      <PageHeader
        title="Suppliers and Branches"
        subtitle="The branch profiles every order depends on. A branch needs a name, store number, account number and phone before it can receive orders."
        actions={perms.setup && <Button variant="primary" onClick={() => setEdit({ open: true, supplierId: "SUP-SW" })}><Plus className="h-4 w-4" /> Add branch</Button>}
      />
      {!perms.setup && (
        <Banner tone="info" className="mb-4" title="Read-only for your role">
          The office manager maintains branch setup. {perms.seeAccount ? "" : "Account numbers are only visible to the owner and office manager."}
        </Banner>
      )}
      <div className="space-y-4">
        {db.suppliers.map((s) => {
          const branches = db.branches.filter((b) => b.supplierId === s.id);
          return (
            <Card key={s.id} className="p-4">
              <CardLabel icon={<Building2 />} right={<Badge tone={s.launchPhase === "Launch" ? "green" : "gray"}>{s.launchPhase ?? "Launch"}</Badge>}>{s.name}</CardLabel>
              <ConnectionStrip supplier={s} canSetup={perms.setup} onEdit={() => setConn(s)} />
              <div className="mt-4">
                {branches.length === 0 ? (
                  <EmptyState title="No branches yet." action={perms.setup && <Button onClick={() => setEdit({ open: true, supplierId: s.id })}><Plus className="h-4 w-4" /> Add branch</Button>} />
                ) : (
                  <Table>
                    <THead>
                      <tr>
                        <TH>Branch</TH>
                        <TH>Store #</TH>
                        {perms.seeAccount && <TH>Account #</TH>}
                        <TH>Phone</TH>
                        <TH>Setup</TH>
                        <TH>Open orders</TH>
                        <TH />
                      </tr>
                    </THead>
                    <tbody>
                      {branches.map((b) => {
                        const gaps = branchGaps(b);
                        const open = branchCommitments(db, b.id);
                        return (
                          <TR key={b.id}>
                            <TD className="font-semibold text-ink">{b.name}{b.address && <div className="text-xs font-normal text-gray-500">{b.address}</div>}</TD>
                            <TD>{b.storeNumber || <span className="italic text-red-500">Missing</span>}</TD>
                            {perms.seeAccount && <TD className="font-mono text-xs">{b.accountNumber || <span className="italic text-red-500">Missing</span>}</TD>}
                            <TD>{b.phone || <span className="italic text-red-500">Missing</span>}</TD>
                            <TD>
                              {b.active === false ? <Badge tone="gray">Deactivated</Badge> : gaps.length ? <Badge tone="amber">Setup incomplete</Badge> : <Badge tone="green">Ready for orders</Badge>}
                              {gaps.length > 0 && <div className="mt-0.5 text-xs text-gray-500">Missing {gaps.map((g) => g.label.toLowerCase()).join(", ")}</div>}
                            </TD>
                            <TD>{open.length ? open.map((p) => p.id).join(", ") : <span className="text-gray-300">None</span>}</TD>
                            <TD>
                              {perms.setup && (
                                <RowMenu items={[
                                  { label: "Edit branch", icon: <Pencil />, onSelect: () => setEdit({ open: true, branch: b, supplierId: b.supplierId }) },
                                  b.active === false
                                    ? { label: "Reactivate branch", icon: <Power />, onSelect: () => act(setBranchActive, b.id, true).ok && toast.success("Branch reactivated") }
                                    : { label: "Deactivate branch", icon: <Power />, danger: true, onSelect: () => setDeactivate(b) },
                                ]} />
                              )}
                            </TD>
                          </TR>
                        );
                      })}
                    </tbody>
                  </Table>
                )}
              </div>
            </Card>
          );
        })}
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-4">
            <CardLabel icon={<CalendarDays />}>Working calendar</CardLabel>
            <p className="mt-2 text-xs text-gray-600">Monday to Friday, 7:00 a.m. to 4:00 p.m. branch-local time. The acknowledgment clock pauses outside these hours and on observed US federal holidays.</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {holidays.map((h) => <Badge key={h} tone="gray">{dateLong(`${h}T12:00:00`)}</Badge>)}
            </div>
            <p className="mt-2 text-xs text-gray-500">Maintained by the office manager. Both branches use the same calendar at launch.</p>
          </Card>
          <Card className="p-4">
            <CardLabel icon={<Plug />}>Connection access</CardLabel>
            <p className="mt-2 text-xs text-gray-600">
              Each supplier has a connection type. <strong>Manual</strong> and <strong>Email</strong> orders are sent by a person with evidence recorded. <strong>API / EDI</strong> orders are transmitted as a structured order and the supplier's status replies update the order automatically.
            </p>
            <p className="mt-2 text-xs text-amber-800"><FlaskConical className="mr-1 inline h-3.5 w-3.5" />API / EDI runs through a sandbox connector in this build. No real supplier is contacted.</p>
            <p className="mt-2 flex items-center gap-1.5 text-xs text-gray-500"><ShieldCheck className="h-3.5 w-3.5" /> Only connection health shows here. Credentials are write-only and never displayed.</p>
          </Card>
        </div>
      </div>

      {conn && <ConnectionModal supplier={conn} onClose={() => setConn(undefined)} />}
      <BranchModal key={edit.branch?.id ?? `new${edit.open}`} open={edit.open} branch={edit.branch} supplierId={edit.supplierId} onClose={() => setEdit({ open: false })} />
      <ConfirmDialog
        open={!!deactivate}
        onOpenChange={(v) => !v && setDeactivate(undefined)}
        title={`Deactivate ${deactivate?.name}?`}
        body="A deactivated branch can't receive new orders. Deactivation is blocked while the branch holds an open commitment."
        confirmLabel="Deactivate"
        onConfirm={() => deactivate && act(setBranchActive, deactivate.id, false).ok && toast.success("Branch deactivated")}
      />
    </>
  );
}

const HEALTH: Record<ConnectionHealth, { label: string; tone: "green" | "amber" | "red" | "gray"; dot: string }> = {
  healthy: { label: "Healthy", tone: "green", dot: "bg-green-500" },
  untested: { label: "Not tested", tone: "amber", dot: "bg-amber-500" },
  failing: { label: "Failing", tone: "red", dot: "bg-red-500" },
  not_configured: { label: "No electronic connection", tone: "gray", dot: "bg-gray-300" },
};

function ConnectionStrip({ supplier, canSetup, onEdit }: { supplier: Supplier; canSetup: boolean; onEdit: () => void }) {
  const c = supplier.connection ?? { type: "manual" as const, health: "not_configured" as const };
  const h = HEALTH[c.health];
  const [testing, setTesting] = useState(false);
  const test = async () => {
    if (c.mode === "live") {
      setTesting(true);
      const status = await fetchLiveStatus(supplier.id);
      setTesting(false);
      if (act(recordLiveCheck, supplier.id, status).ok) toast.success("Connection healthy", `Live endpoint ${status.endpointHost}.${status.webhookSecretSet ? "" : " Add a webhook secret so status replies can be verified."}`);
      return;
    }
    if (act(testSupplierConnection, supplier.id).ok) toast.success("Connection healthy", c.sandbox ? "Sandbox connector — no real supplier was contacted." : undefined);
  };
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-gray-50/60 px-3 py-2 text-xs">
      <Plug className="h-4 w-4 text-gray-500" />
      <span className="font-semibold text-ink">{CONNECTION_LABEL[c.type]}</span>
      {c.endpointLabel && <span className="text-gray-600">· {c.endpointLabel}</span>}
      {c.orderEmail && <span className="font-mono text-xs text-gray-600">· {c.orderEmail}</span>}
      {c.sandbox && <Badge tone="amber"><FlaskConical className="mr-1 h-3 w-3" />Sandbox</Badge>}
      {c.mode === "live" && <Badge tone="green">Live{c.endpointHost ? ` · ${c.endpointHost}` : ""}</Badge>}
      <span className="inline-flex items-center gap-1.5" aria-label={`Connection health: ${h.label}`}>
        <span className={`h-2 w-2 rounded-full ${h.dot}`} aria-hidden />
        <span className="text-gray-600">{h.label}</span>
      </span>
      {c.lastCheckedAt && <span className="text-xs text-gray-500">checked {dateTime(c.lastCheckedAt)}</span>}
      {c.lastError && <span className="text-xs text-red-600">{c.lastError}</span>}
      {c.type === "api_edi" && (
        <span className="text-xs text-gray-500">
          {c.mode === "live"
            ? c.lastCheckedAt ? (c.credentialsOnFile ? "API key set on the server" : "No API key on the server") : "Server settings not checked yet"
            : c.credentialsOnFile ? `Credential on file${c.credentialsUpdatedAt ? ` since ${dateLong(c.credentialsUpdatedAt)}` : ""}` : "No credential on file"}
        </span>
      )}
      {canSetup && (
        <span className="ml-auto flex gap-2">
          {c.type === "api_edi" && <Button size="sm" onClick={test} disabled={testing}>{testing ? "Testing…" : "Test connection"}</Button>}
          <Button size="sm" onClick={onEdit}><Pencil className="h-3.5 w-3.5" /> Connection</Button>
        </span>
      )}
    </div>
  );
}

function ConnectionModal({ supplier, onClose }: { supplier: Supplier; onClose: () => void }) {
  const prev = supplier.connection;
  const [d, setD] = useState<ConnectionDraft>({ type: prev?.type ?? "manual", mode: prev?.mode ?? "sandbox", endpointLabel: prev?.endpointLabel ?? "", orderEmail: prev?.orderEmail ?? "", credential: "" });
  const { run, e } = useErr();
  const save = () => {
    if (run(act(saveSupplierConnection, supplier.id, d))) {
      toast.success("Connection saved", d.type === "api_edi" ? "Run Test connection before sending orders electronically." : undefined);
      onClose();
    }
  };
  const hasCredential = prev?.type === "api_edi" && prev.credentialsOnFile;
  return (
    <Modal open onOpenChange={(v) => !v && onClose()} title={`${supplier.name} connection`} description="How orders reach this supplier."
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>Save connection</Button></>}>
      <div className="space-y-4">
        <Field label="Connection type" required>
          <PillTabs value={d.type} onChange={(type) => setD({ ...d, type })} options={(Object.keys(CONNECTION_LABEL) as SupplierConnectionType[]).map((k) => ({ value: k, label: CONNECTION_LABEL[k] }))} />
        </Field>
        {d.type === "manual" && <p className="text-xs text-gray-600">Orders are printed or phoned in, with the hand-off or call recorded as evidence.</p>}
        {d.type === "email" && (
          <Field label="Order inbox" required error={e("orderEmail")} hint="Orders are emailed here; the sent message and delivery receipt are still recorded as evidence.">
            <Input type="email" value={d.orderEmail} onChange={(ev) => setD({ ...d, orderEmail: ev.target.value })} placeholder="orders@7132.sw.example" invalid={!!e("orderEmail")} />
          </Field>
        )}
        {d.type === "api_edi" && (
          <>
            <Field label="Mode" required>
              <PillTabs value={d.mode ?? "sandbox"} onChange={(mode) => setD({ ...d, mode })} options={[{ value: "sandbox", label: "Sandbox" }, { value: "live", label: "Live" }]} />
            </Field>
            {d.mode === "live" ? (
              <Banner tone="info" title="Live connection">
                Orders are posted over HTTPS to the supplier's endpoint by this app's server. The endpoint, API key and webhook secret are server settings, so they are never typed here or shown:
                <ul className="mt-1 list-disc pl-5 font-mono text-xs">
                  <li>{envName(supplier.id, "ENDPOINT_URL")}</li>
                  <li>{envName(supplier.id, "API_KEY")}</li>
                  <li>{envName(supplier.id, "WEBHOOK_SECRET")}</li>
                </ul>
                <span className="mt-1 block">The supplier posts status replies to <span className="font-mono">/api/suppliers/{supplier.id}/webhook</span>, signed with the webhook secret.</span>
              </Banner>
            ) : (
              <Banner tone="warn" title="Sandbox connector">Orders are validated and accepted by a simulated endpoint. No real supplier is contacted.</Banner>
            )}
            <Field label="Connector name" required error={e("endpointLabel")}>
              <Input value={d.endpointLabel} onChange={(ev) => setD({ ...d, endpointLabel: ev.target.value })} placeholder="SW PRO ordering API" invalid={!!e("endpointLabel")} />
            </Field>
            {d.mode !== "live" && <Field label="API key / EDI credential" required={!hasCredential} error={e("credential")}
              hint={hasCredential ? "A credential is on file. Leave blank to keep it, or enter a new one to replace it. It is never shown." : "Stored write-only. It is never shown again, and never written to the activity log."}>
              <Input type="password" autoComplete="new-password" value={d.credential} onChange={(ev) => setD({ ...d, credential: ev.target.value })} placeholder={hasCredential ? "•••••••• on file" : ""} invalid={!!e("credential")} />
            </Field>}
          </>
        )}
      </div>
    </Modal>
  );
}

function BranchModal({ open, branch, supplierId, onClose }: { open: boolean; branch?: Branch; supplierId?: string; onClose: () => void }) {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const perms = procurementPerms(user);
  const [d, setD] = useState<BranchDraft>({
    supplierId: branch?.supplierId ?? supplierId ?? "SUP-SW", name: branch?.name ?? "", storeNumber: branch?.storeNumber ?? "",
    accountNumber: branch?.accountNumber ?? "", phone: branch?.phone ?? "", address: branch?.address ?? "",
  });
  const { run, e } = useErr();
  const save = () => {
    if (run(act(saveBranch, d, branch?.id))) {
      toast.success(branch ? "Branch updated" : "Branch added", `${d.name} (store ${d.storeNumber}) can now receive orders.`);
      onClose();
    }
  };
  const set = (k: keyof BranchDraft) => (ev: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setD({ ...d, [k]: ev.target.value });
  return (
    <Modal open={open} onOpenChange={(v) => !v && onClose()} title={branch ? `Edit ${branch.name}` : "Add branch"} description="All four fields are required before any order can be assigned to the branch."
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>Save branch</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Supplier" required className="sm:col-span-2">
          <Select value={d.supplierId} onChange={set("supplierId")}>
            {db.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
        <Field label="Branch name" required error={e("name")}><Input value={d.name} onChange={set("name")} invalid={!!e("name")} /></Field>
        <Field label="Store number" required error={e("storeNumber")}><Input value={d.storeNumber} onChange={set("storeNumber")} invalid={!!e("storeNumber")} /></Field>
        {perms.seeAccount && <Field label="Account number" required error={e("accountNumber")}><Input value={d.accountNumber} onChange={set("accountNumber")} invalid={!!e("accountNumber")} /></Field>}
        <Field label="Phone" required error={e("phone")}><Input value={d.phone} onChange={set("phone")} placeholder="(214) 555-0132" invalid={!!e("phone")} /></Field>
        <Field label="Address" className="sm:col-span-2"><Input value={d.address} onChange={set("address")} /></Field>
      </div>
    </Modal>
  );
}
