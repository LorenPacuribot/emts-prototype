"use client";
/**
 * Feature 22 — Employees, crews and activity codes (reference data).
 * Menu: Workforce > Employees & Crews
 *
 * Employee types behave differently: hourly time is exported, salaried time
 * costs jobs only, and subcontractor hours carry zero labour cost.
 * Offboarding disables login and keeps history.
 */
import { Users } from "lucide-react";
import { useCurrentUser, useDb } from "@/features/lib/store";
import { can } from "@/features/lib/permissions";
import { byId } from "@/features/lib/selectors";
import { dateLong } from "@/features/lib/format";
import { ACTIVITY_LABEL, OVERHEAD_ACTIVITIES } from "@/features/lib/rules/payroll";
import type { ActivityCode } from "@/features/types";
import { PageHeader } from "@/features/components/layout/screen";
import { Badge, Card, CardLabel, Table, TD, TH, THead, TR } from "@/features/components/ui";
import { WorkforceFrame } from "./workforce-frame";

const TYPE = { hourly: { label: "Hourly — exported", tone: "blue" }, salaried: { label: "Salaried — job cost only", tone: "purple" }, subcontractor: { label: "Subcontractor — zero labour cost", tone: "gray" } } as const;

const ACTIVITY_NOTE: Record<ActivityCode, string> = {
  application: "Paid, job-coded",
  preparation: "Paid, job-coded",
  travel: "Paid, charged to the second job",
  shop_setup: "Paid, job-coded",
  training: "Paid, overhead",
  rained_out: "Paid, overhead",
};

export function EmployeesScreen() {
  return (
    <WorkforceFrame tab="employees">
      <Employees />
    </WorkforceFrame>
  );
}

function Employees() {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const detail = can(user, "time.payrollDetail");
  return (
    <>
      <PageHeader title="Employees & Crews" subtitle="Who clocks time, how their time is treated, and the activity codes the crew picks from." />
      <Card className="mb-4 p-4">
        <CardLabel icon={<Users />}>Employees</CardLabel>
        <Table className="mt-3">
          <THead><tr><TH>Name</TH><TH>Type</TH><TH>Crew</TH>{detail && <TH>Gusto ID</TH>}<TH>App login</TH><TH>Status</TH></tr></THead>
          <tbody>
            {db.employees.map((e) => (
              <TR key={e.id}>
                <TD className="font-semibold">{e.name}<div className="text-[11px] font-normal text-slate-400">{e.id}</div></TD>
                <TD><Badge tone={TYPE[e.type].tone}>{TYPE[e.type].label}</Badge></TD>
                <TD>{db.crews.find((c) => c.id === e.crewId)?.name ?? "—"}</TD>
                {detail && <TD>{e.gustoId ?? "—"}</TD>}
                <TD>{e.userId ? byId(db.users, e.userId)?.email : <span className="text-slate-400">No login</span>}</TD>
                <TD>{e.offboardedAt ? <Badge tone="gray">Offboarded {dateLong(e.offboardedAt)} · login disabled, history kept</Badge> : <Badge tone="green">Active</Badge>}</TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <Card className="p-4">
          <CardLabel>Crews</CardLabel>
          {db.crews.map((c) => (
            <div key={c.id} className="mt-3 rounded-lg border border-line p-3 text-[12.5px]">
              <div className="font-semibold text-ink">{c.name}</div>
              <div className="text-slate-500">Lead: {byId(db.users, c.leadUserId)?.name} · {db.employees.filter((e) => e.crewId === c.id && !e.offboardedAt).length} active members</div>
            </div>
          ))}
        </Card>
        <Card className="p-4">
          <CardLabel>Activity codes</CardLabel>
          <ul className="mt-3 space-y-1.5 text-[12.5px]">
            {(Object.keys(ACTIVITY_LABEL) as ActivityCode[]).map((a) => (
              <li key={a} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                <span className="font-semibold">{ACTIVITY_LABEL[a]}</span>
                <Badge tone={OVERHEAD_ACTIVITIES.includes(a) ? "gray" : "blue"}>{ACTIVITY_NOTE[a]}</Badge>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11.5px] text-slate-500">PTO and holidays stay in Gusto. They are neither imported nor exported here.</p>
        </Card>
      </div>
    </>
  );
}
