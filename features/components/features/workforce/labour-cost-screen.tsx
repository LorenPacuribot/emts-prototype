"use client";
/**
 * Cross-Feature Rule 3 — The actual wage cost source.
 * Menu: Workforce > Labour Cost
 *
 * After each Gusto run the bookkeeper enters one approved labour cost total
 * per employee per pay period, plus the burden. Estimate Master allocates it
 * across jobs by approved hours. Only the bookkeeper and the owner see
 * per-employee totals; everyone else sees allocated job cost only.
 */
import { useState } from "react";
import { CheckCircle2, Scale, Wallet } from "lucide-react";
import { act, useCurrentUser, useDb } from "@/features/lib/store";
import { can } from "@/features/lib/permissions";
import { byId } from "@/features/lib/selectors";
import { dateLong, dateTime, money } from "@/features/lib/format";
import { toast } from "@/features/lib/toast";
import { addDaysToDay, carriesLabourCost, hm } from "@/features/lib/rules/payroll";
import { burdenedTotal, reconcileLabour } from "@/features/lib/rules/labour-cost";
import { roundMoney } from "@/features/lib/rules/rounding";
import { approvedJobMinutes, enterLabourCost, recordReconciliation, setBurden } from "@/features/lib/store/actions/workforce";
import { userName } from "@/features/lib/store/helpers";
import { PageHeader } from "@/features/components/layout/screen";
import { Badge, Banner, Button, Card, CardLabel, EmptyState, Field, Input, Modal, Select, Stat, StatStrip, Table, TD, TH, THead, TR } from "@/features/components/ui";
import { WorkforceFrame } from "./workforce-frame";
import { WeekSelect, dayLabel, thisWeek } from "./shared";

export function LabourCostScreen() {
  return (
    <WorkforceFrame tab="labour">
      <Labour />
    </WorkforceFrame>
  );
}

function Labour() {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const [week, setWeek] = useState(addDaysToDay(thisWeek(), -14));
  const [entering, setEntering] = useState<string>();
  const seeEmployees = can(user, "labour.seeEmployeeTotals");

  const totals = db.labourCosts.filter((l) => l.weekStart === week);
  const staff = db.employees.filter((e) => carriesLabourCost(e) && approvedJobMinutes(db, e.id, week).length);
  const jobRows = new Map<string, { jobId?: string; minutes: number; amount: number }>();
  for (const t of totals) for (const a of t.allocations) {
    const key = a.jobId ?? "OVERHEAD";
    const r = jobRows.get(key) ?? { jobId: a.jobId, minutes: 0, amount: 0 };
    r.minutes += a.minutes;
    r.amount = roundMoney(r.amount + a.amount);
    jobRows.set(key, r);
  }
  const rec = reconcileLabour(totals);
  const months = [...new Set(db.labourCosts.map((l) => l.weekStart.slice(0, 7)))].sort().reverse();

  return (
    <>
      <PageHeader
        title="Labour Cost"
        subtitle="Rule 3: one approved total per employee per pay period from the Gusto run, allocated across jobs by approved hours. Estimate Master holds no pay rates."
        actions={<WeekSelect value={week} onChange={setWeek} />}
      />
      {!seeEmployees && <Banner tone="info" className="mb-4" title="Allocated job cost only">Per-employee totals are visible only to the bookkeeper and the business owner.</Banner>}

      <StatStrip className="mb-4">
        <Stat label="Burdened total entered" value={money(rec.entered)} hint={`${totals.length} employee${totals.length === 1 ? "" : "s"}`} />
        <Stat label="Allocated to jobs" value={money(rec.allocated)} tone={rec.ok ? "good" : "warn"} />
        <Stat label="Check" value={totals.length ? (rec.ok ? "Matches" : "Mismatch") : "—"} tone={!totals.length ? "default" : rec.ok ? "good" : "danger"} hint="allocated must equal entered" />
        <Stat label="Burden" value={`${db.payrollSettings.burdenPct}%`} hint={`set by ${userName(db, db.payrollSettings.burdenSetBy)}`} />
      </StatStrip>

      {seeEmployees ? (
        <Card className="mb-4 p-4">
          <CardLabel icon={<Wallet />}>Per-employee totals · week of {dayLabel(week, false)}</CardLabel>
          <div className="mt-3">
            {staff.length === 0 ? <EmptyState title="No approved hours in this week" body="Totals are entered after the week's time is approved and paid." /> : (
              <Table>
                <THead><tr><TH>Employee</TH><TH className="text-right">Approved hours</TH><TH className="text-right">Gusto total</TH><TH className="text-right">Burden</TH><TH className="text-right">Burdened</TH><TH>Allocated to</TH><TH /></tr></THead>
                <tbody>
                  {staff.map((e) => {
                    const t = totals.find((x) => x.employeeId === e.id);
                    const mins = approvedJobMinutes(db, e.id, week).reduce((a, m) => a + m.minutes, 0);
                    return (
                      <TR key={e.id}>
                        <TD className="font-semibold">{e.name}<div className="text-xs font-normal text-gray-400">{e.type === "salaried" ? "Salaried — period cost" : "Hourly"}</div></TD>
                        <TD className="text-right tabular-nums">{hm(mins)}</TD>
                        <TD className="text-right tabular-nums">{t ? money(t.amount) : <span className="text-gray-400">Not entered</span>}</TD>
                        <TD className="text-right tabular-nums">{t ? `${t.burdenPct}%` : "—"}</TD>
                        <TD className="text-right tabular-nums font-semibold">{t ? money(burdenedTotal(t.amount, t.burdenPct)) : "—"}</TD>
                        <TD>
                          <div className="flex flex-wrap gap-1">
                            {t?.allocations.map((a) => <span key={a.jobId ?? "oh"} className="rounded-md bg-gray-100 px-1.5 py-0.5 text-xs font-semibold text-gray-600">{a.jobId ?? "Overhead"} {money(a.amount)}</span>)}
                          </div>
                        </TD>
                        <TD>{can(user, "labour.enter") && <Button size="sm" onClick={() => setEntering(e.id)}>{t ? "Update" : "Enter total"}</Button>}</TD>
                      </TR>
                    );
                  })}
                </tbody>
              </Table>
            )}
          </div>
          <p className="mt-2 text-xs text-gray-500">Subcontractor hours are not listed: their invoice supplies the cost. The rounding residual goes to the largest allocation, then the lowest job number (Rule 5).</p>
        </Card>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2 [&>*]:min-w-0">
        <Card className="p-4">
          <CardLabel icon={<Scale />}>Allocated job cost · week of {dayLabel(week, false)}</CardLabel>
          <div className="mt-3">
            {jobRows.size === 0 ? <p className="text-xs italic text-gray-400">No totals entered for this week yet.</p> : (
              <Table>
                <THead><tr><TH>Job</TH><TH className="text-right">Approved hours</TH><TH className="text-right">Labour cost</TH></tr></THead>
                <tbody>
                  {[...jobRows.values()].map((r) => (
                    <TR key={r.jobId ?? "oh"}><TD className="font-semibold">{r.jobId ? `${r.jobId} · ${byId(db.jobs, r.jobId)?.name ?? ""}` : "Overhead"}</TD><TD className="text-right tabular-nums">{hm(r.minutes)}</TD><TD className="text-right tabular-nums">{money(r.amount)}</TD></TR>
                  ))}
                </tbody>
              </Table>
            )}
          </div>
        </Card>
        <MonthlyCheck months={months} />
      </div>

      <BurdenCard />
      <EnterModal employeeId={entering} week={week} onClose={() => setEntering(undefined)} />
    </>
  );
}

function MonthlyCheck({ months }: { months: string[] }) {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const [month, setMonth] = useState(months[0] ?? "");
  const [note, setNote] = useState("");
  const r = reconcileLabour(db.labourCosts.filter((l) => l.weekStart.slice(0, 7) === month));
  return (
    <Card className="p-4">
      <CardLabel icon={<CheckCircle2 />}>Monthly check (office manager)</CardLabel>
      <p className="mt-1 text-xs text-gray-500">Allocated cost for each period must equal the entered total exactly.</p>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <Field label="Month">
          <Select value={month} onChange={(e) => setMonth(e.target.value)} className="w-40">
            {months.length === 0 && <option value="">No totals yet</option>}
            {months.map((m) => <option key={m} value={m}>{m}</option>)}
          </Select>
        </Field>
        <div className="pb-2 text-xs">Entered {money(r.entered)} · allocated {money(r.allocated)} {month && <Badge tone={r.ok ? "green" : "red"}>{r.ok ? "Matches" : "Mismatch"}</Badge>}</div>
      </div>
      {can(user, "labour.reconcile") && (
        <div className="mt-3 flex gap-2">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" />
          <Button onClick={() => { const res = act(recordReconciliation, month, note); if (res.ok) { toast.success("Monthly check recorded"); setNote(""); } }}>Record check</Button>
        </div>
      )}
      <ul className="mt-3 space-y-1 text-xs text-gray-600">
        {db.payrollSettings.reconciliations.map((c, i) => <li key={i}>{c.month}: {c.ok ? "✓ matches" : "✗ mismatch"} — {userName(db, c.by)}, {dateLong(c.at)}. {c.note}</li>)}
      </ul>
    </Card>
  );
}

function BurdenCard() {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const [value, setValue] = useState(String(db.payrollSettings.burdenPct));
  if (!can(user, "labour.setBurden")) return null;
  return (
    <Card className="mt-4 p-4">
      <CardLabel>Burden percentage (owner)</CardLabel>
      <p className="mt-1 text-xs text-gray-500">Applied to actual paid wages, including overtime, at the same percentage. Changes apply to totals entered from now on.</p>
      <div className="mt-3 flex gap-2">
        <Input type="number" value={value} onChange={(e) => setValue(e.target.value)} className="w-32" aria-label="Burden percent" />
        <Button onClick={() => act(setBurden, Number(value)).ok && toast.success("Burden updated")}>Save</Button>
      </div>
    </Card>
  );
}

function EnterModal({ employeeId, week, onClose }: { employeeId?: string; week: string; onClose: () => void }) {
  const db = useDb((d) => d);
  const emp = byId(db.employees, employeeId);
  const existing = db.labourCosts.find((l) => l.employeeId === employeeId && l.weekStart === week);
  const [amount, setAmount] = useState("");
  const [burden, setBurdenV] = useState("");
  const [err, setErr] = useState<{ msg: string; field?: string }>();
  return (
    <Modal
      open={!!employeeId}
      onOpenChange={(v) => !v && onClose()}
      size="sm"
      title={`Labour cost — ${emp?.name ?? ""}`}
      description={`Week of ${dayLabel(week, false)}. Enter the approved total from the Gusto run.${existing ? ` Last entered ${dateTime(existing.enteredAt)}.` : ""}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => {
            const r = act(enterLabourCost, employeeId!, week, Number(amount || existing?.amount), Number(burden || existing?.burdenPct || db.payrollSettings.burdenPct));
            if (r.ok) { toast.success("Total entered", "Allocated across jobs by approved hours."); setAmount(""); setBurdenV(""); onClose(); }
            else setErr({ msg: r.error, field: r.field });
          }}>Save and allocate</Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2 [&>*]:min-w-0">
        <Field label="Gusto total ($)" required error={err?.field === "amount" ? err.msg : undefined}>
          <Input type="number" value={amount} placeholder={existing ? String(existing.amount) : "e.g. 1120"} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Burden (%)" error={err?.field === "burden" ? err.msg : undefined}>
          <Input type="number" value={burden} placeholder={String(existing?.burdenPct ?? db.payrollSettings.burdenPct)} onChange={(e) => setBurdenV(e.target.value)} />
        </Field>
        {err && !err.field && <p className="text-xs text-red-600 sm:col-span-2">{err.msg}</p>}
      </div>
    </Modal>
  );
}
