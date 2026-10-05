'use client';

/*
  Marketing › Automations, 30 Sep call (Complete version).

  - RulesView (CRM-C4): rules as stacked When / If / Then cards. Saved as
    linked steps (trigger → condition → actions with next / yes / no links),
    the same data the flow view draws. Each rule shows its approval: "Ask me
    first" until an Owner or Admin approves it; any edit removes it.
  - FlowView (CRM-C5, ?view=flow): the same rule as a flow with a steps
    palette, a canvas with Yes / No branch labels and a settings panel.
    Edits here change the same linked steps the Rules editor saves.
  - ApprovalsView (?view=approvals): "Waiting for approval", the customer
    messages rules and templates prepared. Send, Edit, Skip, or Approve this
    automation. Nothing is sent to a customer without one of these.
  Engine: lib/automation.ts. Events are picked up by components/leads/CrmSync.tsx.
*/
import { useMemo, useState } from 'react';
import { ArrowDown, CheckCircle2, GitBranch, Mail, MessageSquare, Pencil, Plus, Send, SkipForward, Zap } from 'lucide-react';
import { useCollection, useCurrentUser } from '@/lib/store';
import type { AutomationRule, AutomationTrigger, PreparedMessage, RuleNode } from '@/lib/types';
import { cn, fullName, uid } from '@/lib/utils';
import {
  addStep, approvalLabel, canApproveAutomation, CONDITION_LABEL, draftToNodes, removeStep, ruleProblem, ruleToDraft, TRIGGER_LABEL, waitingCount, type RuleDraft,
} from '@/lib/automation';
import { Badge, Banner, Button, Card, EmptyState, Field, Input, Modal, NewBadge, Select, Switch, Textarea, VersionBadge } from '@/features/components/ui';
import { toast } from '@/features/lib/toast';

type Action = NonNullable<RuleNode['action']>;
type Condition = NonNullable<RuleNode['condition']>;

const triggerLabel = (t: PreparedMessage['trigger']) => (t === 'lead_stage' ? 'Lead stage' : TRIGGER_LABEL[t]);

/* ---------- Tabs ---------- */

export type AutomationView = 'list' | 'rules' | 'flow' | 'approvals';

export function AutomationViewTabs({ view, onChange }: { view: AutomationView; onChange: (v: AutomationView) => void }) {
  const { items } = useCollection('preparedMessages');
  const n = waitingCount(items);
  const tabs: { key: AutomationView; label: string; item?: string }[] = [
    { key: 'list', label: 'Automations' },
    { key: 'rules', label: 'Rules', item: 'CRM-C4' },
    { key: 'flow', label: 'Flow', item: 'CRM-C5' },
    { key: 'approvals', label: `Waiting for approval${n ? ` (${n})` : ''}`, item: 'CRM-C3' },
  ];
  return (
    <div className="mb-5 flex flex-wrap gap-1 rounded-xl border border-gray-200 bg-gray-100 p-1" role="tablist" aria-label="Automation views" data-tour="crm-automation-views">
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          role="tab"
          aria-selected={view === t.key}
          onClick={() => onChange(t.key)}
          className={cn('flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold', view === t.key ? 'bg-white text-ink shadow-sm' : 'text-gray-600 hover:text-ink')}
        >
          {t.label}
          {t.item && <VersionBadge item={t.item} />}
        </button>
      ))}
    </div>
  );
}

/* ---------- Approval pill and button (shared by rules and the queue) ---------- */

function ApprovalPill({ rule }: { rule: { approval?: AutomationRule['approval'] } }) {
  return <Badge tone={rule.approval ? 'green' : 'amber'}>{approvalLabel(rule.approval)}</Badge>;
}

function useApprove() {
  const rules = useCollection('automationRules');
  const templates = useCollection('automatedMessages');
  const prepared = useCollection('preparedMessages');
  const me = useCurrentUser();
  const allowed = canApproveAutomation(me.role);
  /** Approves a rule or template, and sends what it has waiting. */
  const approve = (kind: 'rule' | 'template', id: string) => {
    const approval = { byId: me.id, by: fullName(me), at: new Date().toISOString() };
    if (kind === 'rule') rules.update(id, { approval });
    else templates.update(id, { approval });
    const waiting = prepared.items.filter((m) => m.status === 'waiting' && m.sourceKind === kind && m.sourceId === id);
    if (waiting.length) {
      const at = new Date().toISOString();
      prepared.setAll(prepared.items.map((m) => (waiting.includes(m) ? { ...m, status: 'sent' as const, decidedAt: at, decidedBy: fullName(me) } : m)));
    }
    toast.success('Automation approved', waiting.length ? `${waiting.length} waiting ${waiting.length === 1 ? 'message' : 'messages'} sent (sandbox). New ones send without asking.` : 'Its messages now send without asking.');
  };
  return { allowed, approve };
}

function ApproveConfirm({ when, message, onConfirm, onClose }: { when: string; message: string; onConfirm: () => void; onClose: () => void }) {
  return (
    <Modal
      open
      onOpenChange={(v) => !v && onClose()}
      title="Approve automation"
      size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => { onConfirm(); onClose(); }}>Approve</Button></>}
    >
      <div className="space-y-2 text-sm text-gray-700">
        <p><b>When:</b> {when}</p>
        <p className="whitespace-pre-wrap rounded-lg bg-gray-50 p-3 text-gray-600">{message}</p>
        <p className="font-semibold text-ink">Messages from this rule will send without asking. Approve?</p>
      </div>
    </Modal>
  );
}

/* ---------- Rules (CRM-C4) ---------- */

const blankRule = (): AutomationRule => {
  const at = new Date().toISOString();
  const d: RuleDraft = { name: 'New rule', active: false, trigger: 'job_complete', then: { channel: 'email', subject: 'Thank you from {{orgName}}', body: 'Hi {{firstName}},\n\n' } };
  return { id: uid('ar'), name: d.name, active: d.active, createdAt: at, updatedAt: at, ...draftToNodes(d) };
};

export function RulesView() {
  const rules = useCollection('automationRules');
  const [selected, setSelected] = useState(rules.items[0]?.id);
  const rule = rules.items.find((r) => r.id === selected) ?? rules.items[0];
  const add = () => {
    const r = blankRule();
    rules.add(r);
    setSelected(r.id);
  };
  return (
    <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
      <div className="space-y-2">
        {rules.items.map((r) => (
          <button key={r.id} type="button" onClick={() => setSelected(r.id)} className={cn('w-full rounded-xl border p-3 text-left', rule?.id === r.id ? 'border-primary-300 bg-primary-50' : 'border-gray-200 bg-white hover:border-gray-300')}>
            <div className="font-semibold text-ink">{r.name}</div>
            <div className="mt-1 flex flex-wrap gap-1.5"><Badge tone={r.active ? 'green' : 'gray'}>{r.active ? 'On' : 'Off'}</Badge><ApprovalPill rule={r} /></div>
          </button>
        ))}
        <Button variant="secondary" className="w-full justify-center" onClick={add}><Plus className="h-4 w-4" /> Add rule</Button>
      </div>
      {rule ? <RuleEditor key={rule.id + rule.updatedAt} rule={rule} /> : <EmptyState title="No rules yet" body="Add a rule to send a message when something happens." />}
    </div>
  );
}

function StepCard({ label, icon, tone, children }: { label: string; icon: React.ReactNode; tone: string; children: React.ReactNode }) {
  return (
    <Card className="p-4">
      <div className={cn('mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-widest', tone)}>{icon} {label}</div>
      {children}
    </Card>
  );
}

const Down = () => <div className="flex justify-center py-1 text-gray-300"><ArrowDown className="h-4 w-4" /></div>;

function ActionFields({ value, onChange }: { value: Action; onChange: (a: Action) => void }) {
  return (
    <div className="space-y-3">
      <Field label="Send">
        <Select value={value.channel} onChange={(e) => onChange({ ...value, channel: e.target.value as Action['channel'] })}>
          <option value="email">Email</option>
          <option value="sms">Text message</option>
        </Select>
      </Field>
      {value.channel === 'email' && <Field label="Subject"><Input value={value.subject ?? ''} onChange={(e) => onChange({ ...value, subject: e.target.value })} /></Field>}
      <Field label="Message" hint="{{firstName}}, {{customerName}}, {{projectName}}, {{orgName}}">
        <Textarea rows={4} value={value.body} onChange={(e) => onChange({ ...value, body: e.target.value })} />
      </Field>
    </div>
  );
}

function RuleEditor({ rule }: { rule: AutomationRule }) {
  const rules = useCollection('automationRules');
  const { allowed, approve } = useApprove();
  const [d, setD] = useState<RuleDraft>(() => ruleToDraft(rule));
  const [confirming, setConfirming] = useState(false);
  const dirty = JSON.stringify(d) !== JSON.stringify(ruleToDraft(rule));
  // A rule built in Flow can have more steps than these cards show; saving here would drop them.
  const tooBig = draftToNodes(ruleToDraft(rule)).nodes.length !== rule.nodes.length;
  const save = () => {
    if (!d.name.trim()) return toast.error('Give the rule a name');
    if (!d.then.body.trim() || (d.otherwise && !d.otherwise.body.trim())) return toast.error('Write the message');
    rules.update(rule.id, { name: d.name.trim(), active: d.active, ...draftToNodes(d), approval: undefined, updatedAt: new Date().toISOString() });
    toast.success('Rule saved', rule.approval ? 'Approval removed: its messages ask first again.' : 'Its messages wait for approval.');
  };
  const setCond = (c?: Condition) => setD({ ...d, condition: c, otherwise: c ? d.otherwise : undefined });

  return (
    <div className="space-y-1">
      {tooBig && <Banner tone="warn" title="This rule has more steps than these cards show">It was built in Flow. Edit it there so no step is lost.</Banner>}
      <Card className="flex flex-wrap items-center gap-3 p-4">
        <div className="min-w-[220px] flex-1"><Field label="Rule name"><Input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} /></Field></div>
        <Switch checked={d.active} onCheckedChange={(v) => setD({ ...d, active: v })} label={d.active ? 'On' : 'Off'} />
        <ApprovalPill rule={rule} />
        {!rule.approval && allowed && <Button size="sm" variant="primary" disabled={dirty} onClick={() => setConfirming(true)} title={dirty ? 'Save first' : undefined}>Approve automation</Button>}
        <span className="flex items-center gap-1.5"><VersionBadge item="CRM-C4" /></span>
      </Card>
      <Down />
      <StepCard label="When" icon={<Zap className="h-3.5 w-3.5" />} tone="text-primary-700">
        <Select aria-label="Trigger" value={d.trigger} onChange={(e) => setD({ ...d, trigger: e.target.value as AutomationTrigger })}>
          {(Object.keys(TRIGGER_LABEL) as AutomationTrigger[]).map((t) => <option key={t} value={t}>{TRIGGER_LABEL[t]}</option>)}
        </Select>
      </StepCard>
      <Down />
      <StepCard label="If" icon={<GitBranch className="h-3.5 w-3.5" />} tone="text-amber-700">
        {d.condition ? (
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Field">
              <Select value={d.condition.field} onChange={(e) => { const field = e.target.value as Condition['field']; setCond({ field, op: field === 'estimate_value' ? 'over' : 'is', value: '' }); }}>
                {(Object.keys(CONDITION_LABEL) as Condition['field'][]).map((f) => <option key={f} value={f}>{CONDITION_LABEL[f]}</option>)}
              </Select>
            </Field>
            <span className="pb-2 text-sm text-gray-500">{d.condition.op === 'over' ? 'is over $' : 'is'}</span>
            <Field label="Value"><Input value={d.condition.value} onChange={(e) => setCond({ ...d.condition!, value: e.target.value })} /></Field>
            <Button size="sm" variant="secondary" onClick={() => setCond(undefined)}>Remove condition</Button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2 text-sm text-gray-500">
            Always, for every event.
            <Button size="sm" variant="secondary" onClick={() => setCond({ field: 'estimate_value', op: 'over', value: '5000' })}><Plus className="h-3.5 w-3.5" /> Add condition</Button>
          </div>
        )}
      </StepCard>
      <Down />
      <div className={cn('grid gap-3', d.condition && 'md:grid-cols-2')}>
        <StepCard label={d.condition ? 'Then (yes)' : 'Then'} icon={<Send className="h-3.5 w-3.5" />} tone="text-green-700">
          <ActionFields value={d.then} onChange={(then) => setD({ ...d, then })} />
        </StepCard>
        {d.condition && (
          <StepCard label="Otherwise (no)" icon={<Send className="h-3.5 w-3.5" />} tone="text-gray-600">
            {d.otherwise ? (
              <>
                <ActionFields value={d.otherwise} onChange={(otherwise) => setD({ ...d, otherwise })} />
                <Button size="sm" variant="secondary" className="mt-3" onClick={() => setD({ ...d, otherwise: undefined })}>Send nothing</Button>
              </>
            ) : (
              <div className="flex items-center justify-between gap-2 text-sm text-gray-500">
                Nothing is sent.
                <Button size="sm" variant="secondary" onClick={() => setD({ ...d, otherwise: { channel: 'sms', body: 'Hi {{firstName}}, ' } })}><Plus className="h-3.5 w-3.5" /> Add message</Button>
              </div>
            )}
          </StepCard>
        )}
      </div>
      <div className="flex justify-end gap-2 pt-3">
        <Button variant="secondary" disabled={!dirty} onClick={() => setD(ruleToDraft(rule))}>Discard</Button>
        <Button variant="primary" disabled={!dirty || tooBig} onClick={save}>Save rule</Button>
      </div>
      {confirming && (
        <ApproveConfirm when={TRIGGER_LABEL[d.trigger]} message={[d.then.subject, d.then.body].filter(Boolean).join('\n\n')} onConfirm={() => approve('rule', rule.id)} onClose={() => setConfirming(false)} />
      )}
    </div>
  );
}

/* ---------- Flow (CRM-C5) ---------- */

const PALETTE: { key: 'condition' | 'email' | 'sms'; label: string; icon: typeof Zap; tone: string }[] = [
  { key: 'condition', label: 'If', icon: GitBranch, tone: 'text-amber-700' },
  { key: 'email', label: 'Send email', icon: Mail, tone: 'text-green-700' },
  { key: 'sms', label: 'Send text', icon: MessageSquare, tone: 'text-green-700' },
];

function nodeTitle(n: RuleNode) {
  if (n.kind === 'trigger') return `When: ${n.trigger ? TRIGGER_LABEL[n.trigger] : '—'}`;
  if (n.kind === 'condition' && n.condition) return `If ${CONDITION_LABEL[n.condition.field].toLowerCase()} ${n.condition.op === 'over' ? `is over $${n.condition.value}` : `is ${n.condition.value || '…'}`}`;
  return n.action?.channel === 'sms' ? 'Send text' : 'Send email';
}

export function FlowView() {
  const rules = useCollection('automationRules');
  const [ruleId, setRuleId] = useState(rules.items[0]?.id);
  const rule = rules.items.find((r) => r.id === ruleId) ?? rules.items[0];
  if (!rule) return <EmptyState title="No rules yet" body="Add a rule in Rules to see its flow." />;
  return <FlowEditor key={rule.id + rule.updatedAt} rule={rule} rules={rules.items} onPick={setRuleId} />;
}

function FlowEditor({ rule, rules, onPick }: { rule: AutomationRule; rules: AutomationRule[]; onPick: (id: string) => void }) {
  const store = useCollection('automationRules');
  const [nodes, setNodes] = useState<RuleNode[]>(() => structuredClone(rule.nodes));
  const [sel, setSel] = useState<string>(rule.startId);
  const dirty = JSON.stringify(nodes) !== JSON.stringify(rule.nodes);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const selected = byId.get(sel) ?? byId.get(rule.startId);

  const apply = (r: ReturnType<typeof addStep>, select?: string) => {
    if (!r.ok) return toast.error(r.error);
    setNodes(r.nodes);
    if (select) setSel(select);
  };
  const add = (key: 'condition' | 'email' | 'sms') => {
    if (!selected) return;
    const id = uid('n');
    const step: RuleNode = key === 'condition'
      ? { id, kind: 'condition', condition: { field: 'estimate_value', op: 'over', value: '5000' } }
      : { id, kind: 'action', action: key === 'email' ? { channel: 'email', subject: 'A note from {{orgName}}', body: 'Hi {{firstName}},\n\n' } : { channel: 'sms', body: 'Hi {{firstName}}, ' } };
    apply(addStep(nodes, selected.id, step), id);
  };
  const patch = (p: Partial<RuleNode>) => setNodes((ns) => ns.map((n) => (n.id === selected?.id ? { ...n, ...p } : n)));
  const save = () => {
    const problem = ruleProblem(nodes);
    if (problem) return toast.error(problem);
    store.update(rule.id, { nodes, approval: undefined, updatedAt: new Date().toISOString() });
    toast.success('Rule saved', rule.approval ? 'Approval removed: its messages ask first again.' : 'Its messages wait for approval.');
  };

  const draw = (id: string | undefined, depth = 0): React.ReactNode => {
    const n = id ? byId.get(id) : undefined;
    if (!n || depth > 20) return null;
    const box = (
      <button
        type="button"
        onClick={() => setSel(n.id)}
        className={cn('w-full max-w-[260px] rounded-xl border bg-white px-3 py-2 text-left text-sm shadow-sm', selected?.id === n.id ? 'border-primary-400 ring-2 ring-primary-100' : 'border-gray-200 hover:border-gray-300')}
      >
        <div className="text-xxs font-black uppercase tracking-widest text-gray-500">{n.kind === 'trigger' ? 'Trigger' : n.kind === 'condition' ? 'Condition' : 'Action'}</div>
        <div className="font-semibold text-ink">{nodeTitle(n)}</div>
      </button>
    );
    if (n.kind === 'condition') {
      return (
        <div className="flex flex-col items-center">
          {box}
          <div className="mt-2 grid w-full grid-cols-2 gap-4">
            {(['yes', 'no'] as const).map((b) => (
              <div key={b} className="flex flex-col items-center">
                <span className={cn('mb-1 rounded-full px-2 py-0.5 text-xs font-bold', b === 'yes' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600')}>{b === 'yes' ? 'Yes' : 'No'}</span>
                <ArrowDown className="mb-1 h-4 w-4 text-gray-300" />
                {n[b] ? draw(n[b], depth + 1) : <span className="text-xs italic text-gray-400">Nothing sent</span>}
              </div>
            ))}
          </div>
        </div>
      );
    }
    return (
      <div className="flex flex-col items-center">
        {box}
        {n.next && <><ArrowDown className="my-1 h-4 w-4 text-gray-300" />{draw(n.next, depth + 1)}</>}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select aria-label="Rule" value={rule.id} onChange={(e) => onPick(e.target.value)} className="w-64">
          {rules.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </Select>
        <ApprovalPill rule={rule} />
        <VersionBadge item="CRM-C5" />
        <span className="ml-auto flex gap-2">
          <Button variant="secondary" disabled={!dirty} onClick={() => setNodes(structuredClone(rule.nodes))}>Discard</Button>
          <Button variant="primary" disabled={!dirty} onClick={save}>Save rule</Button>
        </span>
      </div>
      <p className="text-xs text-gray-500">The flow and the Rules editor change the same steps. Pick a step, then add the next one from the palette or change it on the right.</p>
      <div className="grid gap-4 lg:grid-cols-[180px_minmax(0,1fr)_280px]">
        <Card className="p-3">
          <div className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-500">Steps</div>
          <ul className="space-y-1.5">
            {PALETTE.map((p) => (
              <li key={p.key}>
                <button type="button" onClick={() => add(p.key)} title={`Add after "${selected ? nodeTitle(selected) : ''}"`}
                  className="flex w-full items-center gap-2 rounded-lg border border-dashed border-gray-300 px-2 py-1.5 text-left text-sm text-gray-700 hover:border-primary-300 hover:bg-primary-50">
                  <p.icon className={cn('h-4 w-4', p.tone)} /> {p.label}
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-gray-500">Adds after the selected step. After an If, it fills the empty branch.</p>
        </Card>
        <Card className="overflow-x-auto bg-gray-50 p-5">{draw(rule.startId)}</Card>
        <Card className="space-y-3 p-4">
          <div className="text-xs font-bold uppercase tracking-wider text-gray-500">Settings</div>
          {!selected ? <p className="text-sm text-gray-500">Select a step.</p> : (
            <>
              <div className="font-semibold text-ink">{nodeTitle(selected)}</div>
              {selected.kind === 'trigger' && (
                <Field label="When">
                  <Select value={selected.trigger} onChange={(e) => patch({ trigger: e.target.value as AutomationTrigger })}>
                    {(Object.keys(TRIGGER_LABEL) as AutomationTrigger[]).map((t) => <option key={t} value={t}>{TRIGGER_LABEL[t]}</option>)}
                  </Select>
                </Field>
              )}
              {selected.kind === 'condition' && selected.condition && (
                <>
                  <Field label="Field">
                    <Select value={selected.condition.field} onChange={(e) => { const field = e.target.value as Condition['field']; patch({ condition: { field, op: field === 'estimate_value' ? 'over' : 'is', value: '' } }); }}>
                      {(Object.keys(CONDITION_LABEL) as Condition['field'][]).map((f) => <option key={f} value={f}>{CONDITION_LABEL[f]}</option>)}
                    </Select>
                  </Field>
                  <Field label={selected.condition.op === 'over' ? 'Is over ($)' : 'Is'}>
                    <Input value={selected.condition.value} onChange={(e) => patch({ condition: { ...selected.condition!, value: e.target.value } })} />
                  </Field>
                </>
              )}
              {selected.kind === 'action' && selected.action && <ActionFields value={selected.action} onChange={(action) => patch({ action })} />}
              {selected.kind !== 'trigger' && (
                <Button size="sm" variant="danger" onClick={() => apply(removeStep(nodes, rule.startId, selected.id), rule.startId)}>
                  Remove step
                </Button>
              )}
              {selected.kind === 'condition' && <p className="text-xs text-gray-500">Removing an If keeps its Yes path.</p>}
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

/* ---------- Waiting for approval ---------- */

export function ApprovalsView() {
  const prepared = useCollection('preparedMessages');
  const { items: rules } = useCollection('automationRules');
  const { items: templates } = useCollection('automatedMessages');
  const me = fullName(useCurrentUser());
  const { allowed, approve } = useApprove();
  const [editing, setEditing] = useState<PreparedMessage>();
  const [confirming, setConfirming] = useState<PreparedMessage>();
  const waiting = useMemo(() => prepared.items.filter((m) => m.status === 'waiting'), [prepared.items]);
  const done = useMemo(() => prepared.items.filter((m) => m.status !== 'waiting').slice(0, 20), [prepared.items]);
  const sourceOf = (m: PreparedMessage) => (m.sourceKind === 'rule' ? rules.find((r) => r.id === m.sourceId) : templates.find((t) => t.id === m.sourceId));

  const decide = (m: PreparedMessage, status: 'sent' | 'skipped', patch: Partial<PreparedMessage> = {}) => {
    prepared.update(m.id, { ...patch, status, decidedAt: new Date().toISOString(), decidedBy: me });
    if (status === 'sent') toast.success(`Sent to ${m.customerName}`, 'Sandbox: recorded, not delivered.');
    else toast.info('Skipped', `${m.customerName} gets nothing from this one.`);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h3 className="font-heading text-lg font-bold text-ink">Waiting for approval</h3>
        <VersionBadge item="CRM-C3" />
      </div>
      {waiting.length === 0 ? (
        <EmptyState icon={<CheckCircle2 />} title="Nothing waiting" body="Messages from rules and templates that are not approved wait here before anything reaches a customer." />
      ) : (
        <div className="space-y-3">
          {waiting.map((m) => {
            const src = sourceOf(m);
            return (
              <Card key={m.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold text-ink">{m.customerName || 'Customer'} <span className="font-normal text-gray-500">· {m.channel === 'email' ? 'Email' : 'Text'} to {m.to || 'no address on file'}</span></div>
                    <div className="mt-0.5 text-xs text-gray-500">{m.sourceName} · {triggerLabel(m.trigger)} · {new Date(m.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</div>
                  </div>
                  <span className="flex flex-wrap gap-1.5">
                    <Button size="sm" variant="primary" disabled={!m.to} onClick={() => decide(m, 'sent')}><Send className="h-3.5 w-3.5" /> Send</Button>
                    <Button size="sm" variant="secondary" onClick={() => setEditing(m)}><Pencil className="h-3.5 w-3.5" /> Edit</Button>
                    <Button size="sm" variant="secondary" onClick={() => decide(m, 'skipped')}><SkipForward className="h-3.5 w-3.5" /> Skip</Button>
                    {allowed && src && !src.approval && <Button size="sm" variant="secondary" onClick={() => setConfirming(m)}>Approve this automation</Button>}
                  </span>
                </div>
                <div className="mt-3 rounded-lg bg-gray-50 p-3 text-sm text-gray-700">
                  {m.subject && <div className="mb-1 font-semibold text-ink">{m.subject}</div>}
                  <div className="whitespace-pre-wrap">{m.body}</div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
      {done.length > 0 && (
        <Card className="p-4">
          <div className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-500">Recently decided</div>
          <ul className="divide-y divide-gray-100 text-sm">
            {done.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="text-gray-700">{m.customerName} · {m.sourceName}</span>
                <span className="flex items-center gap-2 text-xs text-gray-500">
                  <Badge tone={m.status === 'sent' ? 'green' : 'gray'}>{m.status === 'sent' ? (m.auto ? 'Sent automatically' : 'Sent') : 'Skipped'}</Badge>
                  {m.decidedBy}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {editing && <EditMessage m={editing} onClose={() => setEditing(undefined)} onSave={(patch, send) => { if (send) decide(editing, 'sent', patch); else { prepared.update(editing.id, patch); toast.success('Message updated'); } setEditing(undefined); }} />}
      {confirming && (
        <ApproveConfirm
          when={triggerLabel(confirming.trigger)}
          message={[confirming.subject, confirming.body].filter(Boolean).join('\n\n')}
          onConfirm={() => approve(confirming.sourceKind, confirming.sourceId)}
          onClose={() => setConfirming(undefined)}
        />
      )}
    </div>
  );
}

function EditMessage({ m, onClose, onSave }: { m: PreparedMessage; onClose: () => void; onSave: (patch: Partial<PreparedMessage>, send: boolean) => void }) {
  const [subject, setSubject] = useState(m.subject ?? '');
  const [body, setBody] = useState(m.body);
  const patch = { subject: m.channel === 'email' ? subject : undefined, body };
  return (
    <Modal
      open
      onOpenChange={(v) => !v && onClose()}
      title={`Edit message to ${m.customerName}`}
      size="md"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="secondary" onClick={() => onSave(patch, false)}>Save</Button><Button variant="primary" disabled={!m.to || !body.trim()} onClick={() => onSave(patch, true)}>Save and send</Button></>}
    >
      <div className="space-y-3">
        {m.channel === 'email' && <Field label="Subject"><Input value={subject} onChange={(e) => setSubject(e.target.value)} /></Field>}
        <Field label="Message"><Textarea rows={6} value={body} onChange={(e) => setBody(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}
