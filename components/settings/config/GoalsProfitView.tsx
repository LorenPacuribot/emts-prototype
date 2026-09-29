'use client';

/*
  Settings > Goals & Profit ("Financial Overview" in the live app).

  Dashboard view: charge rate, target revenue, income targets, labor burden,
  revenue dollar split, pipeline targets and projected annual budget.
  "Recalculate Goals" opens the 4-step Engine Calibration wizard (Income Goals,
  Expense Allocation, Labor Burden, Review & Save). "Apply Financial Model"
  saves the inputs to the `goalsProfit` singleton (and updates the annual and
  monthly revenue targets that the dashboard and reports read). The calculated
  charge rate is also copied to General Configuration > Base Labor Rate.

  The math is the live app's local calculation:
    targetRevenue   = desiredIncome / profitMargin
    expense%        = materials% + misc% (misc only if included)
    labor%          = 100 - profit% - expense%
    burdened cost   = basePay * (1 + burden%)
    charge rate     = burdened cost / labor%
    jobs            = ceil(targetRevenue / avgJobSize), then estimates and leads
*/
import React, { useMemo, useState } from 'react';
import {
  Activity, ArrowLeft, ArrowRight, Briefcase, Calculator, Check, DollarSign, FileText, Paintbrush, PieChart,
  RefreshCw, Target, TrendingUp, Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input, Switch } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import { useSingleton } from '@/lib/store';
import { cn } from '@/lib/utils';
import type { GoalsProfit } from '@/lib/types';
import { numberOrZero } from './ui';

type Burden = NonNullable<GoalsProfit['burden']>;
interface Model {
  desiredAnnualIncome: number;
  profitMargin: number;
  avgJobSize: number;
  closingRate: number;
  leadConversionRate: number;
  materialCost: number;
  miscExpense: number;
  includeMiscExpense: boolean;
  avgHourlyPay: number;
  burden: Burden;
}

const DEFAULT_BURDEN: Burden = { socialSecurity: 7.65, medicareFuta: 0.1, stateUnemp: 5, workmansComp: 10, otherLiability: 1, benefits: 0 };
const BURDEN_FIELDS: { key: keyof Burden; label: string }[] = [
  { key: 'socialSecurity', label: 'Social Security' },
  { key: 'medicareFuta', label: 'Medicare/FUTA' },
  { key: 'stateUnemp', label: 'State Unemp.' },
  { key: 'workmansComp', label: "Workman's Comp" },
  { key: 'otherLiability', label: 'Other/Liability' },
  { key: 'benefits', label: 'Benefits' },
];

const toModel = (g: GoalsProfit): Model => ({
  desiredAnnualIncome: g.desiredAnnualIncome,
  profitMargin: g.profitMargin,
  avgJobSize: g.avgJobSize ?? 3500,
  closingRate: g.closingRate ?? 35,
  leadConversionRate: g.leadConversionRate ?? 25,
  materialCost: g.materialCost ?? 0,
  miscExpense: g.miscExpense,
  includeMiscExpense: g.includeMiscExpense,
  avgHourlyPay: g.avgHourlyPay ?? 25,
  burden: g.burden ?? DEFAULT_BURDEN,
});

export function calculate(m: Model) {
  const targetRevenue = m.profitMargin > 0 ? m.desiredAnnualIncome / (m.profitMargin / 100) : 0;
  const totalExpensePercent = m.materialCost + (m.includeMiscExpense ? m.miscExpense : 0);
  const laborPercent = 100 - m.profitMargin - totalExpensePercent;
  const burdenPercent = Object.values(m.burden).reduce((a, b) => a + b, 0);
  const burdenedCost = m.avgHourlyPay * (1 + burdenPercent / 100);
  const chargeRate = laborPercent > 0 ? burdenedCost / (laborPercent / 100) : 0;
  const jobs = m.avgJobSize > 0 ? Math.ceil(targetRevenue / m.avgJobSize) : 0;
  const estimates = m.closingRate > 0 ? Math.ceil(jobs / (m.closingRate / 100)) : 0;
  const leads = m.leadConversionRate > 0 ? Math.ceil(estimates / (m.leadConversionRate / 100)) : 0;
  return { targetRevenue, totalExpensePercent, laborPercent, burdenPercent, burdenedCost, chargeRate, jobs, estimates, leads };
}

const usd0 = (n: number) => `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

export function GoalsProfitView() {
  const [goals, setGoals] = useSingleton('goalsProfit');
  const [, setGeneral] = useSingleton('generalConfig');
  const { toast } = useToast();
  const [mode, setMode] = useState<'dashboard' | 'wizard'>('dashboard');
  const [step, setStep] = useState(1);
  const [model, setModel] = useState<Model>(() => toModel(goals));
  const saved = useMemo(() => toModel(goals), [goals]);
  const view = mode === 'wizard' ? model : saved;
  const c = useMemo(() => calculate(view), [view]);

  const upd = <K extends keyof Model>(k: K, v: Model[K]) => setModel((m) => ({ ...m, [k]: v }));

  const startWizard = () => {
    setModel(toModel(goals));
    setStep(1);
    setMode('wizard');
  };

  const apply = () => {
    if (c.laborPercent <= 0) {
      toast('Profit and expenses leave nothing for labor. Lower them before saving.', 'error');
      setStep(2);
      return;
    }
    setGoals({
      desiredAnnualIncome: model.desiredAnnualIncome,
      profitMargin: model.profitMargin,
      avgJobSize: model.avgJobSize,
      closingRate: model.closingRate,
      leadConversionRate: model.leadConversionRate,
      materialCost: model.materialCost,
      miscExpense: model.miscExpense,
      includeMiscExpense: model.includeMiscExpense,
      avgHourlyPay: model.avgHourlyPay,
      burden: model.burden,
      annualRevenueTarget: Math.round(c.targetRevenue * 100) / 100,
      monthlyRevenueTarget: Math.round((c.targetRevenue / 12) * 100) / 100,
    });
    // The calibrated charge rate becomes the default labor rate (General Configuration).
    setGeneral({ baseLaborRate: Math.round(c.chargeRate * 10000) / 10000 });
    toast('Engine calibration saved successfully');
    setMode('dashboard');
  };

  if (mode === 'wizard') {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-8 md:px-8 lg:py-10">
        <div className="relative mb-10 flex items-center justify-between md:justify-center">
          <button type="button" onClick={() => setMode('dashboard')} className="flex items-center gap-1 text-sm font-bold text-gray-500 hover:text-gray-600 md:absolute md:left-0">
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          <h2 className="font-heading text-2xl font-bold text-gray-900 md:text-3xl">Engine Calibration</h2>
        </div>
        <Stepper step={step} onStep={setStep} />
        <div className="flex min-h-[460px] flex-col rounded-[2.5rem] bg-white p-6 shadow-2xl md:p-10">
          <div className="flex-1">
            {step === 1 && <StepIncome m={model} c={c} upd={upd} />}
            {step === 2 && <StepExpenses m={model} c={c} upd={upd} />}
            {step === 3 && <StepLabor m={model} c={c} upd={upd} />}
            {step === 4 && <StepReview m={model} c={c} onApply={apply} />}
          </div>
          <div className="mt-10 flex items-center justify-between border-t border-gray-100 pt-6">
            <Button variant="ghost" icon={<ArrowLeft className="h-4 w-4" />} onClick={() => (step === 1 ? setMode('dashboard') : setStep(step - 1))}>Previous</Button>
            {step < 4 && <Button size="lg" onClick={() => setStep(step + 1)}>Next Step <ArrowRight className="h-5 w-5" /></Button>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 md:px-8 lg:py-10">
      <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="font-heading text-3xl font-bold tracking-tight text-gray-900">Financial Overview</h1>
          <p className="mt-2 text-base text-gray-500">Your business performance targets and pricing strategy.</p>
        </div>
        <Button variant="secondary" icon={<RefreshCw className="h-4 w-4" />} onClick={startWizard}>Recalculate Goals</Button>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2">
        <HeroMetric icon={<Activity />} label="Final OpEx Charge Rate" value={<>${c.chargeRate.toFixed(2)}<span className="text-lg font-bold text-gray-500">/hr</span></>} />
        <HeroMetric icon={<Target />} label="Target Annual Revenue" value={usd0(c.targetRevenue)} />
      </div>

      <div className="mb-10 grid grid-cols-1 gap-6 md:grid-cols-3">
        <MiniCard icon={<DollarSign />} tone="bg-blue-50 text-blue-600" bg={<Target className="text-blue-500" />} title="Income Targets">
          <Row label="Net Income Goal" value={usd0(view.desiredAnnualIncome)} />
          <Row label="Target Margin" value={<span className="text-green-600">{view.profitMargin}%</span>} />
        </MiniCard>
        <MiniCard icon={<Users />} tone="bg-blue-50 text-blue-600" bg={<Users className="text-blue-500" />} title="Labor Burden">
          <Row label="Base Pay (Avg)" value={`$${view.avgHourlyPay.toFixed(2)}`} />
          <Row label="Taxes & Benefits" value={`+${c.burdenPercent.toFixed(1)}%`} />
        </MiniCard>
        <MiniCard icon={<PieChart />} tone="bg-amber-50 text-amber-600" bg={<PieChart className="text-amber-500" />} title="Revenue Dollar">
          <div className="mb-4 flex h-3 w-full overflow-hidden rounded-full">
            <div className="bg-green-500" style={{ width: `${Math.max(0, view.profitMargin)}%` }} />
            <div className="bg-blue-400" style={{ width: `${Math.max(0, c.totalExpensePercent)}%` }} />
            <div className="bg-gray-900" style={{ width: `${Math.max(0, c.laborPercent)}%` }} />
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xxs font-bold uppercase text-gray-500">
            <div>Profit<div className="text-xs font-black text-green-600">{view.profitMargin}%</div></div>
            <div>Expense<div className="text-xs font-black text-blue-500">{c.totalExpensePercent.toFixed(1)}%</div></div>
            <div>Labor<div className="text-xs font-black text-gray-900">{c.laborPercent.toFixed(1)}%</div></div>
          </div>
        </MiniCard>
      </div>

      <Section icon={<TrendingUp />} tone="bg-indigo-50 text-indigo-600" title="Pipeline Targets" sub={`Required volume to hit ${usd0(view.desiredAnnualIncome)} net income.`}>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <PipeCard icon={<Users />} tone="bg-purple-50 text-purple-600" label="Total Leads" value={c.leads} sub={`Based on ${view.leadConversionRate}% conversion`} />
          <PipeCard icon={<FileText />} tone="bg-blue-50 text-blue-600" label="Estimates" value={c.estimates} sub={`Based on ${view.closingRate}% close rate`} />
          <PipeCard icon={<Briefcase />} tone="bg-green-50 text-green-600" label="Jobs Sold" value={c.jobs} sub={`Avg Job Size ${usd0(view.avgJobSize)}`} />
        </div>
      </Section>

      <Section icon={<DollarSign />} tone="bg-green-50 text-green-600" title="Projected Annual Budget" sub={`Estimated dollar allocation based on your target revenue of ${usd0(c.targetRevenue)}.`}>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">
          {[
            { label: 'Payroll Budget', pct: c.laborPercent, icon: <Users />, tone: 'bg-gray-100 text-gray-600' },
            { label: 'Paint & Materials', pct: view.materialCost, icon: <Paintbrush />, tone: 'bg-blue-50 text-blue-600' },
            { label: 'Misc & Marketing', pct: view.includeMiscExpense ? view.miscExpense : 0, icon: <PieChart />, tone: 'bg-purple-50 text-purple-600' },
            { label: 'Net Profit', pct: view.profitMargin, icon: <TrendingUp />, tone: 'bg-green-50 text-green-600', value: view.desiredAnnualIncome },
          ].map((b) => (
            <div key={b.label} className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
              <div className={cn('mb-4 inline-flex rounded-lg p-2 [&>svg]:h-4 [&>svg]:w-4', b.tone)}>{b.icon}</div>
              <div className="mb-1 text-xxs font-black uppercase tracking-widest text-gray-500">{b.label}</div>
              <div className="mb-1 text-2xl font-black tracking-tight text-gray-900">{usd0(b.value ?? c.targetRevenue * (b.pct / 100))}</div>
              <div className="text-xs font-bold text-gray-500">{b.pct.toFixed(1)}% of Revenue</div>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

/* ---------- Dashboard pieces ---------- */

function HeroMetric({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center gap-5 rounded-2xl border border-gray-100 bg-white p-6 shadow-lg">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 text-primary-600 [&>svg]:h-7 [&>svg]:w-7">{icon}</div>
      <div>
        <div className="font-heading text-base font-bold text-gray-900">{label}</div>
        <div className="font-heading text-3xl font-black tracking-tight text-gray-900">{value}</div>
      </div>
    </div>
  );
}

function MiniCard({ icon, tone, bg, title, children }: { icon: React.ReactNode; tone: string; bg: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="relative flex flex-col overflow-hidden rounded-2xl bg-white p-6 shadow-lg">
      <div className="absolute right-0 top-0 p-3 opacity-10 [&>svg]:h-20 [&>svg]:w-20">{bg}</div>
      <div className={cn('mb-4 flex h-10 w-10 items-center justify-center rounded-xl [&>svg]:h-5 [&>svg]:w-5', tone)}>{icon}</div>
      <h4 className="mb-4 font-heading text-lg font-bold text-gray-900">{title}</h4>
      <div className="mt-auto space-y-3">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between border-b border-gray-100 pb-2">
      <span className="text-xs text-gray-500">{label}</span>
      <span className="text-sm font-bold text-gray-900">{value}</span>
    </div>
  );
}

function Section({ icon, tone, title, sub, children }: { icon: React.ReactNode; tone: string; title: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="mb-10 border-t border-gray-100 pt-8">
      <div className="mb-6 flex items-center gap-3">
        <div className={cn('rounded-lg p-2 [&>svg]:h-5 [&>svg]:w-5', tone)}>{icon}</div>
        <div>
          <h3 className="font-heading text-lg font-bold text-gray-900">{title}</h3>
          <p className="text-xs text-gray-500">{sub}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

function PipeCard({ icon, tone, label, value, sub }: { icon: React.ReactNode; tone: string; label: string; value: number; sub: string }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div className={cn('rounded-lg p-2 [&>svg]:h-4 [&>svg]:w-4', tone)}>{icon}</div>
        <span className="text-xxs font-black uppercase tracking-widest text-gray-500">{label}</span>
      </div>
      <div className="mb-1 text-3xl font-black text-gray-900">{value.toLocaleString()}</div>
      <div className="text-xs font-bold text-gray-500">{sub}</div>
    </div>
  );
}

/* ---------- Wizard ---------- */

const STEPS = [
  { id: 1, title: 'Income Goals', icon: Target },
  { id: 2, title: 'Expense Allocation', icon: PieChart },
  { id: 3, title: 'Labor Burden', icon: Users },
  { id: 4, title: 'Review & Save', icon: Calculator },
];

function Stepper({ step, onStep }: { step: number; onStep: (s: number) => void }) {
  return (
    <div className="mb-8 flex items-center justify-center gap-2 md:gap-4">
      {STEPS.map((s, i) => {
        const Icon = s.icon;
        const done = step > s.id;
        const active = step === s.id;
        return (
          <React.Fragment key={s.id}>
            {i > 0 && <div className={cn('h-0.5 w-6 md:w-12', step >= s.id ? 'bg-primary-500' : 'bg-gray-200')} />}
            <button type="button" onClick={() => onStep(s.id)} className="flex flex-col items-center gap-2">
              <span className={cn('flex h-11 w-11 items-center justify-center rounded-2xl border-2 transition', active ? 'border-primary-600 bg-primary-600 text-white shadow-lg shadow-primary-500/30' : done ? 'border-primary-200 bg-primary-50 text-primary-600' : 'border-gray-200 bg-white text-gray-500')}>
                {done ? <Check className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
              </span>
              <span className={cn('hidden text-xxs font-bold uppercase tracking-wider md:block', active ? 'text-primary-700' : 'text-gray-500')}>{s.title}</span>
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
}

type Calc = ReturnType<typeof calculate>;
type Upd = <K extends keyof Model>(k: K, v: Model[K]) => void;

function NumInput({ label, value, onChange, placeholder }: { label: string; value: number; onChange: (n: number) => void; placeholder?: string }) {
  return (
    <Field label={label}>
      <Input type="number" step="any" min="0" value={String(value)} placeholder={placeholder} onChange={(e) => onChange(numberOrZero(e.target.value))} />
    </Field>
  );
}

function StepHeader({ title, sub, center }: { title: string; sub: string; center?: boolean }) {
  return (
    <div className={cn('mb-8', center && 'text-center')}>
      <h2 className="mb-2 font-heading text-2xl font-black text-gray-900 md:text-3xl">{title}</h2>
      <p className="font-medium text-gray-500">{sub}</p>
    </div>
  );
}

function StepIncome({ m, c, upd }: { m: Model; c: Calc; upd: Upd }) {
  return (
    <div>
      <StepHeader title="Set Your Targets" sub="Define annual goals and sales assumptions." />
      <div className="grid grid-cols-1 items-start gap-8 md:grid-cols-2 md:gap-12">
        <div className="space-y-5">
          <h4 className="border-b border-gray-100 pb-2 text-xs font-bold uppercase tracking-widest text-gray-500">Financial Goals</h4>
          <NumInput label="Desired Annual Net Income ($)" value={m.desiredAnnualIncome} placeholder="100000" onChange={(n) => upd('desiredAnnualIncome', n)} />
          <NumInput label="Target Net Profit Margin (%)" value={m.profitMargin} placeholder="35" onChange={(n) => upd('profitMargin', Math.min(100, n))} />
          <h4 className="border-b border-gray-100 pb-2 pt-3 text-xs font-bold uppercase tracking-widest text-gray-500">Sales Assumptions</h4>
          <NumInput label="Average Job Size ($)" value={m.avgJobSize} placeholder="3500" onChange={(n) => upd('avgJobSize', n)} />
          <div className="grid grid-cols-2 gap-4">
            <NumInput label="Closing Rate (%)" value={m.closingRate} placeholder="35" onChange={(n) => upd('closingRate', Math.min(100, n))} />
            <NumInput label="Lead Conv. Rate (%)" value={m.leadConversionRate} placeholder="25" onChange={(n) => upd('leadConversionRate', Math.min(100, n))} />
          </div>
        </div>
        <div className="flex flex-col items-center rounded-[2rem] border border-primary-100 bg-primary-50/50 p-8 text-center">
          <span className="mb-2 text-sm font-bold uppercase tracking-widest text-primary-800">Required Gross Revenue</span>
          <span className="text-4xl font-black tracking-tighter text-gray-900 md:text-5xl">{usd0(c.targetRevenue)}</span>
          <div className="mx-auto my-6 max-w-xs text-sm leading-relaxed text-gray-600">
            To take home <strong>{usd0(m.desiredAnnualIncome)}</strong> at a <strong>{m.profitMargin}%</strong> margin.
          </div>
          <div className="grid w-full grid-cols-3 gap-2 border-t border-primary-200 pt-6 text-center">
            {[['Jobs', c.jobs], ['Ests', c.estimates], ['Leads', c.leads]].map(([l, v]) => (
              <div key={l}>
                <div className="text-2xl font-black text-primary-700">{v}</div>
                <div className="text-xxs font-bold uppercase text-primary-400">{l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function StepExpenses({ m, c, upd }: { m: Model; c: Calc; upd: Upd }) {
  return (
    <div>
      <StepHeader title="Allocate Expenses" sub="Divide your revenue dollar into cost categories." />
      <div className="grid grid-cols-1 gap-8 md:grid-cols-2 md:gap-12">
        <div className="space-y-5">
          <NumInput label="Materials & Sundries %" value={m.materialCost} placeholder="0" onChange={(n) => upd('materialCost', n)} />
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wide text-gray-600">Misc + Marketing Expense %</span>
              <Switch checked={m.includeMiscExpense} onChange={(v) => upd('includeMiscExpense', v)} label="Include misc expense" />
            </div>
            <Input type="number" step="any" min="0" value={String(m.miscExpense)} disabled={!m.includeMiscExpense} onChange={(e) => upd('miscExpense', numberOrZero(e.target.value))} />
          </div>
          {c.laborPercent <= 0 && <p className="text-sm font-medium text-red-600">Profit and expenses add up to 100% or more. Nothing is left for labor.</p>}
        </div>
        <div className="flex flex-col justify-center">
          <h4 className="mb-4 text-center text-xs font-black uppercase tracking-widest text-gray-500">Revenue Dollar Breakdown</h4>
          <div className="flex h-16 w-full overflow-hidden rounded-2xl border border-gray-200 bg-gray-100 shadow-inner">
            {m.profitMargin > 0 && <div className="flex h-full items-center justify-center bg-green-500 text-xs font-black text-white" style={{ width: `${m.profitMargin}%` }}>Profit</div>}
            {c.totalExpensePercent > 0 && <div className="flex h-full items-center justify-center bg-primary-400 text-xs font-black text-white" style={{ width: `${c.totalExpensePercent}%` }}>Exp</div>}
            <div className="flex h-full flex-1 items-center justify-center bg-gray-900 text-xs font-black text-white">Labor</div>
          </div>
          <div className="mt-8 grid grid-cols-2 gap-4">
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
              <span className="mb-1 block text-xxs font-black uppercase tracking-widest text-gray-500">Total Expenses</span>
              <span className="text-2xl font-black text-gray-900">{c.totalExpensePercent.toFixed(1)}%</span>
            </div>
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-4 text-white shadow-lg">
              <span className="mb-1 block text-xxs font-black uppercase tracking-widest text-gray-400">Payroll Budget</span>
              <span className="text-2xl font-black text-primary-400">{c.laborPercent.toFixed(1)}%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StepLabor({ m, c, upd }: { m: Model; c: Calc; upd: Upd }) {
  return (
    <div>
      <StepHeader title="Labor Burden" sub="Calculate the fully burdened hourly cost of your crew." />
      <div className="grid grid-cols-1 gap-8 md:grid-cols-2 md:gap-12">
        <div>
          <div className="mb-6"><NumInput label="Average Base Hourly Pay ($)" value={m.avgHourlyPay} placeholder="25" onChange={(n) => upd('avgHourlyPay', n)} /></div>
          <div className="space-y-4 rounded-2xl border border-gray-100 bg-gray-50 p-6">
            <h4 className="mb-2 border-b border-gray-200 pb-2 text-xxs font-bold uppercase tracking-widest text-gray-700">Taxes &amp; Benefits (%)</h4>
            <div className="grid grid-cols-2 gap-4">
              {BURDEN_FIELDS.map((f) => (
                <NumInput key={f.key} label={f.label} value={m.burden[f.key]} placeholder="0" onChange={(n) => upd('burden', { ...m.burden, [f.key]: n })} />
              ))}
            </div>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center space-y-6">
          <div className="text-center">
            <div className="mb-1 text-sm font-bold uppercase tracking-widest text-gray-500">Total Burden Rate</div>
            <div className="text-4xl font-black text-gray-900">{c.burdenPercent.toFixed(2)}%</div>
          </div>
          <TrueCostCard base={m.avgHourlyPay} burdenPercent={c.burdenPercent} total={c.burdenedCost} />
          <p className="max-w-xs text-center text-xs italic leading-relaxed text-gray-500">&ldquo;This is what it costs your business every hour an employee is on the clock.&rdquo;</p>
        </div>
      </div>
    </div>
  );
}

/** "TRUE COST" card, shared with the Labor Config page. */
export function TrueCostCard({ base, burdenPercent, total, label = 'True Cost' }: { base: number; burdenPercent: number; total: number; label?: string }) {
  return (
    <div className="relative w-full rounded-3xl border-2 border-gray-100 bg-white p-7 shadow-xl">
      <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full border border-amber-200 bg-amber-100 px-3 py-1 text-xxs font-black uppercase tracking-widest text-amber-800">{label}</div>
      <div className="mb-4 flex items-end justify-between border-b border-dashed border-gray-200 pb-4">
        <span className="text-sm font-medium text-gray-500">Base Rate</span>
        <span className="text-lg font-bold text-gray-900">${base.toFixed(2)}</span>
      </div>
      <div className="mb-4 flex items-end justify-between border-b border-dashed border-gray-200 pb-4">
        <span className="text-sm font-medium text-gray-500">Burden ({burdenPercent.toFixed(1)}%)</span>
        <span className="font-bold text-gray-900">+${(base * (burdenPercent / 100)).toFixed(2)}</span>
      </div>
      <div className="flex items-end justify-between pt-2">
        <span className="text-base font-black text-gray-900">Total Cost</span>
        <span className="text-3xl font-black tracking-tighter text-primary-600">${total.toFixed(2)}</span>
      </div>
    </div>
  );
}

function StepReview({ m, c, onApply }: { m: Model; c: Calc; onApply: () => void }) {
  const line = (l: string, v: React.ReactNode, cls = 'text-gray-900') => (
    <div className="flex items-center justify-between"><span className="font-medium text-gray-500">{l}</span><span className={cn('text-lg font-black', cls)}>{v}</span></div>
  );
  return (
    <div>
      <StepHeader center title="Final Engine Calibration" sub="Verify your financial model before applying to the estimation engine." />
      <div className="mx-auto grid w-full max-w-5xl grid-cols-1 items-center gap-10 lg:grid-cols-2">
        <div className="space-y-6">
          <div className="space-y-4 rounded-3xl border border-gray-100 bg-white p-7 shadow-sm">
            <h4 className="border-b border-gray-50 pb-3 text-xs font-black uppercase tracking-[0.2em] text-gray-500">Labor &amp; Burden</h4>
            {line('Base Hourly Pay', `$${m.avgHourlyPay.toFixed(2)}`)}
            {line('Burden Rate', `${c.burdenPercent.toFixed(1)}%`)}
            <div className="flex items-center justify-between border-t border-dashed border-gray-100 pt-4">
              <span className="text-sm font-black uppercase tracking-widest text-gray-900">Burdened Cost</span>
              <span className="text-xl font-black text-primary-600">${c.burdenedCost.toFixed(2)}/hr</span>
            </div>
          </div>
          <div className="space-y-4 rounded-3xl border border-gray-100 bg-white p-7 shadow-sm">
            <h4 className="border-b border-gray-50 pb-3 text-xs font-black uppercase tracking-[0.2em] text-gray-500">Revenue Model</h4>
            {line('Target Margin', `${m.profitMargin}%`, 'text-green-500')}
            {line('Overhead/Exp', `${c.totalExpensePercent.toFixed(1)}%`, 'text-amber-500')}
            <div className="flex items-center justify-between border-t border-dashed border-gray-100 pt-4">
              <span className="text-sm font-black uppercase tracking-widest text-gray-900">Labor Budget</span>
              <span className="text-xl font-black text-gray-900">{c.laborPercent.toFixed(1)}%</span>
            </div>
          </div>
        </div>
        <div className="flex flex-col items-center gap-8">
          <div className="relative w-full overflow-hidden rounded-[2.5rem] border border-blue-100 bg-white p-10 text-center shadow-2xl shadow-primary-500/10">
            <span className="block text-xs font-black uppercase tracking-[0.3em] text-primary-600">Calculated Charge Rate</span>
            <div className="mt-4 text-6xl font-black tracking-tighter text-gray-900 md:text-7xl">${c.chargeRate.toFixed(2)}</div>
            <span className="mt-1 block text-lg font-bold uppercase tracking-widest text-gray-500">per hour</span>
            <div className="mt-10 flex items-center justify-between border-t border-gray-100 px-2 pt-6">
              <span className="text-xs font-bold uppercase tracking-widest text-gray-500">Target Annual Revenue</span>
              <span className="text-xl font-black text-gray-900">{usd0(c.targetRevenue)}</span>
            </div>
          </div>
          <Button size="lg" className="h-14 w-full rounded-2xl text-lg font-black" icon={<Check className="h-6 w-6" />} onClick={onApply}>Apply Financial Model</Button>
        </div>
      </div>
    </div>
  );
}
