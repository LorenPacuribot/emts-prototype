'use client';

/*
  Left sidebar of the Presentation Builder. Tabs:
  - Blocks:   add a block by type and style (live "Design Blocks", Style 1-3)
  - Sections: every section in order with show/hide, move up/down, delete,
              and fields to edit title, subtitle, style and content
  - Branding: theme, primary brand color, heading and body fonts
  - Settings: description, scopes (estimate types), linked estimate/customer
  - Headers / Footers: navigation links and footer message/links
*/
import { useState } from 'react';
import { ArrowDown, ArrowUp, Check, ChevronDown, ChevronRight, Eye, EyeOff, Plus, Trash2 } from 'lucide-react';
import type { Presentation, PresentationSection, PresentationSectionType } from '@/lib/types';
import { useCollection, useLookups } from '@/lib/store';
import { cn, fullName } from '@/lib/utils';
import { Checkbox, Field, Input, NativeSelect, Select, Textarea } from '@/components/ui/form';
import { ADDABLE_TYPES, BODY_FONTS, BRAND_COLORS, ESTIMATE_BLOCKS, HEADING_FONTS, SECTION_META, THEMES, primaryColorOf } from './presentation-utils';
import { EstimateTemplateChecklist } from './PresentationModals';

type Tab = 'Blocks' | 'Sections' | 'Branding' | 'Settings' | 'Headers' | 'Footers';
const TABS: Tab[] = ['Blocks', 'Sections', 'Branding', 'Settings', 'Headers', 'Footers'];
const LIST_TYPES: PresentationSectionType[] = ['services', 'gallery', 'testimonials', 'process'];

export interface SidebarProps {
  p: Presentation;
  change: (patch: Partial<Presentation>) => void;
  addSection: (type: PresentationSectionType, variant: 1 | 2 | 3) => void;
  updateSection: (id: string, patch: Partial<PresentationSection>) => void;
  moveSection: (id: string, dir: -1 | 1) => void;
  removeSection: (id: string) => void;
  selectedId?: string;
  onSelect: (id: string) => void;
}

const heading = 'text-xxs font-black uppercase tracking-widest text-gray-400';
const hint = 'text-xs font-medium italic leading-relaxed text-gray-400';

export function BuilderSidebar(props: SidebarProps) {
  const [tab, setTab] = useState<Tab>('Blocks');
  return (
    <aside className="flex h-72 w-full shrink-0 flex-col border-t border-gray-200 bg-white lg:h-full lg:w-80 lg:border-r lg:border-t-0">
      <div className="grid grid-cols-6 border-b border-gray-100 lg:grid-cols-3">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'relative border-b border-gray-100 py-3 text-xxs font-black uppercase tracking-widest transition-all lg:border-r',
              tab === t ? 'bg-white text-primary-700' : 'bg-gray-50/50 text-gray-400 hover:text-gray-600',
            )}
          >
            {t}
            {tab === t && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-primary-600" />}
          </button>
        ))}
      </div>
      <div className="flex-1 space-y-6 overflow-y-auto p-4 pb-12">
        {tab === 'Blocks' && <BlocksTab {...props} />}
        {tab === 'Sections' && <SectionsTab {...props} />}
        {tab === 'Branding' && <BrandingTab {...props} />}
        {tab === 'Settings' && <SettingsTab {...props} />}
        {tab === 'Headers' && <LinksTab {...props} kind="header" />}
        {tab === 'Footers' && <LinksTab {...props} kind="footer" />}
      </div>
    </aside>
  );
}

/* ---------- Blocks ---------- */

function BlocksTab({ addSection }: SidebarProps) {
  const [collapsed, setCollapsed] = useState<string[]>([]);
  return (
    <div className="space-y-2">
      <div className="mb-4 px-2">
        <h2 className={heading}>Design Blocks</h2>
        <p className={hint}>Click a style to add it to your presentation.</p>
      </div>
      {[...ADDABLE_TYPES, ...ESTIMATE_BLOCKS].map((type) => {
        const m = SECTION_META[type];
        const Icon = m.icon;
        const isCollapsed = collapsed.includes(type);
        return (
          <div key={type} className="border-b border-gray-100 pb-2 last:border-0">
            {type === ESTIMATE_BLOCKS[0] && (
              <div className="mb-1 mt-4 px-2">
                <h2 className={heading}>Estimate Content</h2>
                <p className={hint}>Filled from the estimate in Client Preview: property, scope by surface, paint specifications, optional items and pricing.</p>
              </div>
            )}
            <button
              onClick={() => setCollapsed((c) => (c.includes(type) ? c.filter((x) => x !== type) : [...c, type]))}
              className="flex w-full items-center justify-between rounded-lg px-2 py-3 hover:bg-gray-50"
            >
              <span className="flex items-center gap-2 text-xs font-bold text-gray-700"><Icon className="h-4 w-4 text-gray-400" />{m.label}</span>
              {isCollapsed ? <ChevronRight className="h-4 w-4 text-gray-300" /> : <ChevronDown className="h-4 w-4 text-gray-300" />}
            </button>
            {!isCollapsed && (
              <div className="grid grid-cols-3 gap-2 px-1 pb-3">
                {([1, 2, 3] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => addSection(type, v)}
                    className="group flex flex-col items-center rounded-lg border border-gray-100 bg-gray-50 p-2 transition-all hover:border-primary-300 hover:bg-white hover:shadow-sm"
                  >
                    <MiniPreview v={v} />
                    <span className="mt-1.5 text-xxs font-black uppercase text-gray-300 group-hover:text-primary-600">Style {v}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Tiny thumbnail: style 1 light, style 2 dark, style 3 soft gray. */
function MiniPreview({ v }: { v: 1 | 2 | 3 }) {
  return (
    <div className={cn('flex h-10 w-full flex-col items-center justify-center gap-1 rounded border border-gray-100', v === 2 ? 'bg-gray-900' : v === 3 ? 'bg-gray-100' : 'bg-white')}>
      <div className={cn('h-1 w-1/2 rounded-full', v === 2 ? 'bg-white/70' : 'bg-gray-700')} />
      <div className="flex w-full gap-0.5 px-1.5">
        {[1, 2, 3].map((i) => <div key={i} className={cn('h-3 flex-1 rounded-sm', v === 2 ? 'bg-white/15' : 'bg-primary-100')} />)}
      </div>
    </div>
  );
}

/* ---------- Sections ---------- */

function SectionsTab({ p, updateSection, moveSection, removeSection, selectedId, onSelect }: SidebarProps) {
  return (
    <div className="space-y-3">
      <div className="px-2">
        <h2 className={heading}>Page Sections</h2>
        <p className={hint}>Show, hide, reorder and edit each section.</p>
      </div>
      {p.sections.map((s, i) => {
        const m = SECTION_META[s.type];
        const Icon = m.icon;
        const open = selectedId === s.id;
        const locked = s.type === 'cover';
        return (
          <div key={s.id} className={cn('rounded-xl border bg-white', open ? 'border-primary-300 shadow-sm' : 'border-gray-200')}>
            <div className="flex items-center gap-2 px-3 py-2.5">
              <button onClick={() => onSelect(open ? '' : s.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                <Icon className="h-4 w-4 shrink-0 text-gray-400" />
                <span className={cn('truncate text-xs font-bold', s.enabled ? 'text-gray-800' : 'text-gray-400 line-through')}>{s.title || m.label}</span>
              </button>
              <IconBtn label={s.enabled ? 'Hide section' : 'Show section'} onClick={() => updateSection(s.id, { enabled: !s.enabled })}>
                {s.enabled ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              </IconBtn>
              <IconBtn label="Move up" arrow disabled={locked || i <= 1} onClick={() => moveSection(s.id, -1)}><ArrowUp className="h-3.5 w-3.5" /></IconBtn>
              <IconBtn label="Move down" arrow disabled={locked || i === p.sections.length - 1} onClick={() => moveSection(s.id, 1)}><ArrowDown className="h-3.5 w-3.5" /></IconBtn>
              <IconBtn label="Delete section" danger disabled={locked || s.type === 'estimate'} onClick={() => removeSection(s.id)}><Trash2 className="h-3.5 w-3.5" /></IconBtn>
            </div>
            {open && (
              <div className="space-y-3 border-t border-gray-100 p-3">
                {s.type !== 'cover' && (
                  <Field label="Title"><Input value={s.title} onChange={(e) => updateSection(s.id, { title: e.target.value })} /></Field>
                )}
                <Field label={s.type === 'cover' ? 'Headline' : 'Content'} hint={LIST_TYPES.includes(s.type) ? 'One item per line. Use "Title: description".' : undefined}>
                  {s.type === 'cover' ? (
                    <Input value={s.content} onChange={(e) => updateSection(s.id, { content: e.target.value })} />
                  ) : (
                    <Textarea rows={LIST_TYPES.includes(s.type) ? 6 : 4} value={s.content} onChange={(e) => updateSection(s.id, { content: e.target.value })} className="text-xs" />
                  )}
                </Field>
                <Field label="Subtitle"><Input value={s.subtitle ?? ''} onChange={(e) => updateSection(s.id, { subtitle: e.target.value })} /></Field>
                <Field label="Style">
                  <NativeSelect value={s.variant ?? 1} onChange={(e) => updateSection(s.id, { variant: Number(e.target.value) as 1 | 2 | 3 })}>
                    <option value={1}>Style 1</option>
                    <option value={2}>Style 2</option>
                    <option value={3}>Style 3</option>
                  </NativeSelect>
                </Field>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function IconBtn({ children, onClick, label, disabled, danger, arrow }: { children: React.ReactNode; onClick: () => void; label: string; disabled?: boolean; danger?: boolean; arrow?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={cn(
        'rounded-md p-1 disabled:opacity-25',
        // The move arrows are red, as in the live builder.
        arrow ? 'text-red-500 hover:bg-red-50 hover:text-red-600' : 'text-gray-400',
        !arrow && (danger ? 'hover:bg-red-50 hover:text-red-600' : 'hover:bg-gray-100 hover:text-gray-700'),
      )}
    >
      {children}
    </button>
  );
}

/* ---------- Branding ---------- */

function BrandingTab({ p, change }: SidebarProps) {
  const color = primaryColorOf(p);
  const branding = p.branding ?? { primaryColor: color, headingFont: HEADING_FONTS[0]!.value, bodyFont: BODY_FONTS[0]!.value };
  const isPreset = BRAND_COLORS.some((c) => c.value.toLowerCase() === color.toLowerCase());
  const [custom, setCustom] = useState(!isPreset);
  return (
    <div className="space-y-8">
      <div className="px-2">
        <h2 className={heading}>Visual Style</h2>
        <p className={hint}>Customize the look and feel.</p>
      </div>
      <div className="space-y-3 px-2">
        <div className="text-xs font-bold uppercase tracking-wide text-gray-600">Theme</div>
        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(THEMES) as Presentation['theme'][]).map((k) => (
            <button
              key={k}
              onClick={() => change({ theme: k, cover: THEMES[k].cover, branding: { ...branding, primaryColor: THEMES[k].color } })}
              className={cn('overflow-hidden rounded-lg border-2 text-left', p.theme === k ? 'border-gray-900' : 'border-gray-100 hover:border-gray-300')}
            >
              <div className="h-8" style={{ background: THEMES[k].cover }} />
              <div className="px-2 py-1 text-xs font-bold text-gray-700">{THEMES[k].label}</div>
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-3 px-2">
        <div className="text-xs font-bold uppercase tracking-wide text-gray-600">Primary Brand Color</div>
        <div className="grid grid-cols-5 gap-2">
          {BRAND_COLORS.map((c) => {
            const active = !custom && c.value.toLowerCase() === color.toLowerCase();
            return (
              <button
                key={c.value}
                title={c.name}
                onClick={() => { setCustom(false); change({ branding: { ...branding, primaryColor: c.value } }); }}
                className={cn('flex aspect-square items-center justify-center rounded-lg border-2 transition-all', active ? 'scale-110 border-gray-900 shadow-sm' : 'border-transparent')}
                style={{ backgroundColor: c.value }}
              >
                {active && <Check className="h-4 w-4 text-white" />}
              </button>
            );
          })}
          <button
            onClick={() => setCustom(true)}
            className={cn('flex aspect-square flex-col items-center justify-center rounded-lg border-2 bg-white', custom ? 'scale-110 border-gray-900' : 'border-gray-200')}
            title="Other Color"
          >
            <Plus className="h-3.5 w-3.5 text-gray-400" />
            <span className="text-xxs font-black uppercase leading-none text-gray-400">Other</span>
          </button>
        </div>
        {custom && (
          <div className="flex items-center gap-2">
            <input type="color" value={/^#[0-9a-f]{6}$/i.test(color) ? color : '#2563eb'} onChange={(e) => change({ branding: { ...branding, primaryColor: e.target.value } })} className="h-10 w-10 shrink-0 cursor-pointer rounded border border-gray-200" aria-label="Pick color" />
            <Input value={branding.primaryColor} onChange={(e) => change({ branding: { ...branding, primaryColor: e.target.value } })} placeholder="#000000" />
          </div>
        )}
      </div>
      <div className="space-y-4 px-2">
        <Field label="Heading Font">
          <Select value={branding.headingFont} onChange={(v) => change({ branding: { ...branding, headingFont: v } })} options={HEADING_FONTS.map((f) => ({ value: f.value, label: f.name }))} />
        </Field>
        <Field label="Body Font">
          <Select value={branding.bodyFont} onChange={(v) => change({ branding: { ...branding, bodyFont: v } })} options={BODY_FONTS.map((f) => ({ value: f.value, label: f.name }))} />
        </Field>
      </div>
    </div>
  );
}

/* ---------- Settings (scopes, links) ---------- */

function SettingsTab({ p, change }: SidebarProps) {
  const { items: types } = useCollection('estimateTypes');
  const { items: estimates } = useCollection('estimates');
  const { items: customers } = useCollection('customers');
  const look = useLookups();
  const toggle = (n: string) => change({ scopes: p.scopes.includes(n) ? p.scopes.filter((x) => x !== n) : [...p.scopes, n] });
  return (
    <div className="space-y-6 px-2">
      <div>
        <h2 className={heading}>Presentation Settings</h2>
        <p className={hint}>Scopes and the estimate/customer this proposal is for.</p>
      </div>
      <Field label="Description">
        <Textarea rows={3} value={p.description} onChange={(e) => change({ description: e.target.value })} placeholder="Internal description" />
      </Field>
      <div>
        <div className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-600">Estimate Types (Scopes)</div>
        <div className="space-y-1 rounded-xl border border-gray-200 p-2">
          {types.map((t) => (
            <div key={t.id} className={cn('rounded-lg p-2', p.scopes.includes(t.name) && 'bg-primary-50')}>
              <Checkbox checked={p.scopes.includes(t.name)} onChange={() => toggle(t.name)} label={t.name} />
            </div>
          ))}
        </div>
      </div>
      <div>
        <div className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-600">Used for Estimate Templates</div>
        <EstimateTemplateChecklist value={p.templateIds ?? []} onChange={(templateIds) => change({ templateIds, isTemplate: templateIds.length > 0 || p.isTemplate })} />
        <p className={cn(hint, 'mt-1')}>Client Preview offers this presentation for estimates made from these templates (or, when none are ticked, for the estimate types above).</p>
      </div>
      <Field label="Linked Estimate" hint="Shown in the Estimate section with an approve button.">
        <Select
          value={p.estimateId ?? ''}
          onChange={(v) => {
            const e = look.estimate(v === 'none' ? undefined : v);
            change({ estimateId: e?.id, customerId: e ? e.customerId : p.customerId });
          }}
          options={[{ value: 'none', label: 'No estimate' }, ...estimates.map((e) => ({ value: e.id, label: `${e.estimateNumber} — ${fullName(look.customer(e.customerId))}` }))]}
          placeholder="No estimate"
        />
      </Field>
      <Field label="Customer" hint='Shown as "Prepared for" on the cover.'>
        <Select
          value={p.customerId ?? ''}
          onChange={(v) => change({ customerId: v === 'none' ? undefined : v })}
          options={[{ value: 'none', label: 'No customer' }, ...customers.map((c) => ({ value: c.id, label: fullName(c) }))]}
          placeholder="No customer"
        />
      </Field>
      <Checkbox checked={p.isTemplate} onChange={(v) => change({ isTemplate: v })} label="Use as a template" />
    </div>
  );
}

/* ---------- Header / footer links ---------- */

function LinksTab({ p, change, kind }: SidebarProps & { kind: 'header' | 'footer' }) {
  const isFooter = kind === 'footer';
  const links = (isFooter ? p.footerLinks : p.navLinks) ?? [];
  const set = (next: { label: string; targetId: string }[]) => change(isFooter ? { footerLinks: next } : { navLinks: next });
  const setLink = (i: number, patch: Partial<{ label: string; targetId: string }>) => set(links.map((l, k) => (k === i ? { ...l, ...patch } : l)));
  return (
    <div className="space-y-6">
      <div className="px-2">
        <h2 className={heading}>{isFooter ? 'Footer Content' : 'Navigation Links'}</h2>
        <p className={hint}>{isFooter ? 'Manage your brand message and links.' : 'Connect header text to specific page sections. Leave empty to use section titles.'}</p>
      </div>
      {isFooter && (
        <div className="px-2">
          <Field label="Footer Message">
            <Textarea rows={4} value={p.footerText ?? ''} onChange={(e) => change({ footerText: e.target.value })} placeholder="e.g. Dedicated to the highest expression..." />
          </Field>
        </div>
      )}
      <div className="space-y-4 px-2">
        {links.map((l, i) => (
          <div key={i} className="relative space-y-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
            <button onClick={() => set(links.filter((_, k) => k !== i))} className="absolute right-2 top-2 p-1 text-gray-300 hover:text-red-500" aria-label="Remove link">
              <Trash2 className="h-4 w-4" />
            </button>
            <Field label="Link Label"><Input value={l.label} onChange={(e) => setLink(i, { label: e.target.value })} placeholder="e.g. Contact" /></Field>
            <Field label={isFooter ? 'Link URL' : 'Jump Target'}>
              {isFooter ? (
                <Input value={l.targetId} onChange={(e) => setLink(i, { targetId: e.target.value })} placeholder="https://..." />
              ) : (
                <NativeSelect value={l.targetId} onChange={(e) => setLink(i, { targetId: e.target.value })}>
                  <option value="">-- Select Section --</option>
                  {p.sections.map((s) => <option key={s.id} value={s.id}>{s.title || SECTION_META[s.type].label}</option>)}
                </NativeSelect>
              )}
            </Field>
          </div>
        ))}
        <button
          onClick={() => set([...links, { label: 'New Link', targetId: '' }])}
          className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-200 py-3 text-xs font-bold text-gray-400 hover:border-primary-300 hover:text-primary-600"
        >
          <Plus className="h-4 w-4" /> Add Link
        </button>
      </div>
    </div>
  );
}
