'use client';

/*
  Renders a presentation as a web page: header, each enabled section, footer.
  Used by the builder (edit mode, with inline editing and per-section
  toolbars), the builder preview, and the viewer (scroll or one slide).

  Sizing uses container queries (@container / @3xl:) so the "mobile" device
  preview in the builder lays out like a phone even on a wide screen.
  The primary color comes from branding (or the theme) and is applied with
  inline styles because it is data-driven.
*/
import React from 'react';
import Link from 'next/link';
import { CheckCircle2, ImageIcon, Mail, MapPin, Phone, Quote, Shield, Star } from 'lucide-react';
import type { Estimate, EstimatePresentationSettings, Presentation, PresentationSection } from '@/lib/types';
import { estimateTotals } from '@/lib/calculations';
import { useCollection, useLookups, useSingleton } from '@/lib/store';
import { cn, fullName, initials, longDate, money } from '@/lib/utils';
import { pickImage } from '@/lib/image';
import { customerLines } from '@/lib/proposal';
import { useToast } from '@/components/ui/toast';
import { ProposalCustomer, ProposalOptional, ProposalPricing, ProposalScope, ProposalSpecs, useProposalData } from '@/components/estimates/ProposalParts';
import { THEMES, parseItems, primaryColorOf, SECTION_META } from './presentation-utils';

interface CanvasProps {
  presentation: Presentation;
  /** Inline editing of titles/subtitles/text */
  edit?: boolean;
  onSectionChange?: (id: string, patch: Partial<PresentationSection>) => void;
  /** Toolbar (move/delete buttons) shown over each section in edit mode */
  toolbarFor?: (section: PresentationSection, index: number) => React.ReactNode;
  /** Render only this section (slide mode). Header/footer are hidden. */
  onlySectionId?: string;
  selectedId?: string;
  onSelect?: (id: string) => void;
  className?: string;
  /**
   * Client Preview / customer view: the estimate the template is generated for.
   * Its estimate blocks (property, scope, specs, optional, pricing) are filled
   * from it, and sections hidden with the gear icon are left out.
   */
  estimate?: Estimate;
  /** Client Preview: per-line ⋯ menus on the scope and optional blocks. */
  onEstimateSettings?: (s: EstimatePresentationSettings) => void;
}

interface SectionCtx {
  p: Presentation;
  s: PresentationSection;
  color: string;
  dark: boolean;
  edit: boolean;
  set: (patch: Partial<PresentationSection>) => void;
  estimate?: Estimate;
  onEstimateSettings?: (s: EstimatePresentationSettings) => void;
}

export function PresentationCanvas({ presentation: p, edit = false, onSectionChange, toolbarFor, onlySectionId, selectedId, onSelect, className, estimate, onEstimateSettings }: CanvasProps) {
  const color = primaryColorOf(p);
  const dark = THEMES[p.theme].dark;
  const hiddenByEstimate = new Set(estimate?.presentation?.hiddenSections ?? []);
  const visible = p.sections.filter((s) => (s.enabled || edit) && !hiddenByEstimate.has(s.id));
  const shown = onlySectionId ? visible.filter((s) => s.id === onlySectionId) : visible;

  return (
    <div
      className={cn('@container relative flex flex-col', dark ? 'bg-slate-900 text-white' : 'bg-white text-gray-900', className)}
      style={{ fontFamily: p.branding?.bodyFont }}
    >
      {!onlySectionId && <CanvasHeader p={p} color={color} dark={dark} sections={visible} />}
      {shown.length === 0 && (
        <div className="flex min-h-[320px] items-center justify-center p-10 text-center text-sm text-gray-400">
          No sections yet. Add a block from the sidebar.
        </div>
      )}
      {shown.map((s, i) => {
        const ctx: SectionCtx = { p, s, color, dark, edit, set: (patch) => onSectionChange?.(s.id, patch), estimate, onEstimateSettings };
        return (
          <div
            key={s.id}
            id={`sec-${s.id}`}
            onClick={onSelect ? () => onSelect(s.id) : undefined}
            className={cn(
              'group relative scroll-mt-20',
              !s.enabled && 'opacity-40',
              edit && 'outline-2 -outline-offset-2 outline-transparent hover:outline-dashed hover:outline-primary-300',
              edit && selectedId === s.id && 'outline-dashed outline-primary-500',
            )}
          >
            {edit && !s.enabled && (
              <span className="absolute left-4 top-4 z-40 rounded-full bg-gray-900 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">Hidden</span>
            )}
            {edit && toolbarFor?.(s, i)}
            <SectionBody ctx={ctx} />
          </div>
        );
      })}
      {!onlySectionId && <CanvasFooter p={p} color={color} />}
    </div>
  );
}

/* ---------------- Inline editable text ---------------- */

function Editable({
  value, onChange, edit, className, multiline, placeholder, style,
}: { value: string; onChange: (v: string) => void; edit: boolean; className?: string; multiline?: boolean; placeholder?: string; style?: React.CSSProperties }) {
  if (!edit) return <span className={cn(multiline && 'whitespace-pre-line', className)} style={style}>{value}</span>;
  // A textarea that grows with its text (field-sizing: content) so long
  // headlines wrap exactly like the rendered text. Single-line fields ignore Enter.
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(multiline ? e.target.value : e.target.value.replace(/\n/g, ' '))}
      onKeyDown={(e) => !multiline && e.key === 'Enter' && e.preventDefault()}
      placeholder={placeholder}
      rows={1}
      className={cn('block w-full resize-none overflow-hidden rounded bg-transparent outline-none ring-primary-300 [field-sizing:content] placeholder:opacity-50 hover:ring-1 focus:ring-2', className)}
      style={style}
      onClick={(e) => e.stopPropagation()}
    />
  );
}

function Heading({ ctx, center, light }: { ctx: SectionCtx; center?: boolean; light?: boolean }) {
  const { s, edit, set, p } = ctx;
  return (
    <div className={cn('mb-10', center && 'text-center')}>
      <h2 className={cn('font-heading text-3xl font-extrabold tracking-tight @3xl:text-4xl', center && 'text-center')} style={{ fontFamily: p.branding?.headingFont }}>
        <Editable edit={edit} value={s.title} onChange={(title) => set({ title })} className={center ? 'text-center' : ''} />
      </h2>
      {(s.subtitle || edit) && (
        <p className={cn('mt-3 text-base', light || ctx.dark ? 'text-white/60' : 'text-gray-500', center && 'mx-auto max-w-2xl')}>
          <Editable edit={edit} value={s.subtitle ?? ''} onChange={(subtitle) => set({ subtitle })} placeholder="Add a subtitle" className={center ? 'text-center' : ''} />
        </p>
      )}
    </div>
  );
}

/* ---------------- Header / Footer ---------------- */

function CanvasHeader({ p, color, dark, sections }: { p: Presentation; color: string; dark: boolean; sections: PresentationSection[] }) {
  const [biz] = useSingleton('businessProfile');
  const links = p.navLinks?.length
    ? p.navLinks
    : sections.filter((s) => s.type !== 'cover').slice(0, 4).map((s) => ({ label: s.type === 'estimate' ? 'Proposal' : s.title, targetId: s.id }));
  const go = (id: string) => document.getElementById(`sec-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  return (
    <header className={cn('sticky top-0 z-30 flex items-center justify-between gap-4 border-b px-6 py-4 backdrop-blur', dark ? 'border-white/10 bg-slate-900/90' : 'border-gray-100 bg-white/90')}>
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg text-xs font-black text-white" style={{ backgroundColor: color }}>{initials(biz.companyName)}</span>
        <span className="font-heading text-sm font-extrabold" style={{ fontFamily: p.branding?.headingFont }}>{biz.companyName}</span>
      </div>
      <nav className="hidden items-center gap-6 @3xl:flex">
        {links.map((l, i) => (
          <button key={i} onClick={(e) => { e.stopPropagation(); go(l.targetId); }} className={cn('text-xs font-bold uppercase tracking-widest', dark ? 'text-white/60 hover:text-white' : 'text-gray-500 hover:text-gray-900')}>
            {l.label}
          </button>
        ))}
      </nav>
    </header>
  );
}

function CanvasFooter({ p, color }: { p: Presentation; color: string }) {
  const [biz] = useSingleton('businessProfile');
  return (
    <footer className="mt-auto bg-slate-950 px-8 py-12 text-white">
      <div className="grid gap-8 @3xl:grid-cols-3">
        <div>
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg text-xs font-black" style={{ backgroundColor: color }}>{initials(biz.companyName)}</span>
            <span className="font-heading font-extrabold">{biz.companyName}</span>
          </div>
          <p className="mt-4 text-sm text-white/50">{p.footerText || 'Dedicated to the highest expression of decorative finishing and protection.'}</p>
        </div>
        <div className="space-y-2 text-sm text-white/60">
          <p className="flex items-center gap-2"><Phone className="h-4 w-4" />{biz.phone}</p>
          <p className="flex items-center gap-2"><Mail className="h-4 w-4" />{biz.email}</p>
          <p className="flex items-center gap-2"><MapPin className="h-4 w-4" />{biz.street}, {biz.city}, {biz.state}</p>
        </div>
        <div className="flex flex-wrap gap-4 text-xs font-bold uppercase tracking-widest text-white/60 @3xl:justify-end">
          {(p.footerLinks ?? []).map((l, i) => (
            <a key={i} href={l.targetId || '#'} target="_blank" rel="noreferrer" className="hover:text-white">{l.label}</a>
          ))}
        </div>
      </div>
      <p className="mt-10 border-t border-white/10 pt-6 text-xs text-white/30">© {new Date().getFullYear()} {biz.companyName}. License #{biz.licenseNumber}</p>
    </footer>
  );
}

/* ---------------- Sections ---------------- */

function SectionBody({ ctx }: { ctx: SectionCtx }) {
  switch (ctx.s.type) {
    case 'cover': return <Cover ctx={ctx} />;
    case 'estimate': return <EstimateBlock ctx={ctx} />;
    case 'services': return <Services ctx={ctx} />;
    case 'gallery': return <Gallery ctx={ctx} />;
    case 'testimonials': return <Reviews ctx={ctx} />;
    case 'about': return <About ctx={ctx} />;
    case 'team': return <Owner ctx={ctx} />;
    case 'process': return <WhyUs ctx={ctx} />;
    case 'warranty': return <Terms ctx={ctx} />;
    case 'property':
    case 'scope':
    case 'specs':
    case 'optional':
    case 'pricing':
      return <EstimatePart ctx={ctx} />;
    default: return <Custom ctx={ctx} />;
  }
}

/** The estimate the canvas shows: the one being previewed, else the presentation's linked estimate. */
function useCanvasEstimate(ctx: SectionCtx): Estimate | undefined {
  const look = useLookups();
  return ctx.estimate ?? look.estimate(ctx.p.estimateId);
}

/* ---------------- Estimate-driven blocks (patent 11) ---------------- */

function EstimatePart({ ctx }: { ctx: SectionCtx }) {
  const est = useCanvasEstimate(ctx);
  return (
    <section className={cn(pad, shell(ctx))}>
      <Heading ctx={ctx} />
      {est ? (
        <div className="rounded-2xl bg-white p-6 text-gray-900 shadow-sm @3xl:p-8">
          <EstimatePartBody type={ctx.s.type} est={est} onSettings={ctx.onEstimateSettings} />
          {/* Viewed on its own (not inside Client View, which has its own Accept bar). */}
          {ctx.s.type === 'pricing' && !ctx.estimate && (
            <Link href={`/estimates/${est.id}/client-view`} onClick={(e) => ctx.edit && e.preventDefault()} className="mt-6 ml-auto flex w-full max-w-sm items-center justify-center gap-2 rounded-xl py-3 font-bold text-white" style={{ backgroundColor: ctx.color }}>
              <CheckCircle2 className="h-4 w-4" /> Review & Approve
            </Link>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-gray-300 p-10 text-center text-sm text-gray-400">
          {ctx.edit
            ? `${SECTION_META[ctx.s.type].label}: filled from the estimate when this template is used in Client Preview.`
            : 'This part of your proposal will appear here.'}
        </div>
      )}
    </section>
  );
}

function EstimatePartBody({ type, est, onSettings }: { type: PresentationSection['type']; est: Estimate; onSettings?: (s: EstimatePresentationSettings) => void }) {
  const d = useProposalData(est);
  switch (type) {
    case 'property': return <ProposalCustomer e={est} d={d} />;
    case 'scope': return <ProposalScope e={est} d={d} onSettings={onSettings} bare />;
    case 'specs': return <ProposalSpecs e={est} d={d} bare />;
    case 'optional': return <ProposalOptional e={est} d={d} onSettings={onSettings} bare />;
    case 'pricing': return <ProposalPricing e={est} d={d} />;
    default: return null;
  }
}

/* ---------------- Swappable images ---------------- */

/** An image area. In edit mode a click (or the button) replaces the picture. */
function ImageSlot({ src, fallback, edit, onChange, className, children, label = 'image', clickArea = true }: {
  src?: string | null;
  fallback: string;
  edit: boolean;
  onChange: (dataUrl: string | undefined) => void;
  className?: string;
  children?: React.ReactNode;
  label?: string;
  /** False when the area holds editable text: only the button swaps the image. */
  clickArea?: boolean;
}) {
  const { toast } = useToast();
  const pick = async (ev: React.MouseEvent) => {
    ev.stopPropagation();
    try {
      const img = await pickImage();
      if (img) onChange(img.dataUrl);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not use that image', 'error');
    }
  };
  return (
    <div
      className={cn('relative overflow-hidden', edit && clickArea && 'cursor-pointer', className)}
      style={{ background: fallback }}
      onClick={edit && clickArea ? pick : undefined}
      title={edit && clickArea ? `Click to replace the ${label}` : undefined}
    >
      {src && <span className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${src})` }} aria-hidden />}
      {children}
      {edit && (
        <span className="absolute bottom-3 right-3 z-40 flex gap-1.5">
          <button type="button" onClick={pick} className="flex items-center gap-1 rounded-lg bg-white/90 px-2 py-1 text-[11px] font-bold text-gray-700 shadow hover:bg-white" aria-label={`${src ? 'Swap' : 'Add'} ${label}`}>
            <ImageIcon className="h-3.5 w-3.5" /> {src ? 'Swap image' : 'Add image'}
          </button>
          {src && (
            <button type="button" onClick={(e) => { e.stopPropagation(); onChange(undefined); }} className="rounded-lg bg-white/90 px-2 py-1 text-[11px] font-bold text-red-600 shadow" aria-label={`Remove ${label}`}>
              Remove
            </button>
          )}
        </span>
      )}
    </div>
  );
}

/** Section background by variant: 1 = base, 2 = dark, 3 = soft gray. */
function shell(ctx: SectionCtx) {
  const v = ctx.s.variant ?? 1;
  if (v === 2) return 'bg-slate-900 text-white';
  if (v === 3) return ctx.dark ? 'bg-slate-800' : 'bg-gray-50';
  return '';
}
const pad = 'px-6 py-16 @3xl:px-16 @3xl:py-20';

function Cover({ ctx }: { ctx: SectionCtx }) {
  const { p, s, edit, set, color } = ctx;
  const look = useLookups();
  const customer = look.customer(p.customerId);
  const v = s.variant ?? 1;
  const titleCls = 'font-heading text-4xl font-black leading-tight tracking-tight @3xl:text-6xl';
  if (v === 3) {
    return (
      <section className={cn('grid items-center gap-10 @3xl:grid-cols-2', pad)}>
        <div>
          <div className="mb-4 h-1 w-10 rounded-full" style={{ backgroundColor: color }} />
          <h1 className={titleCls} style={{ fontFamily: p.branding?.headingFont }}><Editable edit={edit} value={s.content} onChange={(content) => set({ content })} /></h1>
          <p className="mt-4 text-lg text-gray-500"><Editable edit={edit} value={s.subtitle ?? ''} onChange={(subtitle) => set({ subtitle })} placeholder="Subtitle" /></p>
          {customer && <p className="mt-6 text-sm font-bold uppercase tracking-widest text-gray-400">Prepared for {fullName(customer)}</p>}
        </div>
        <ImageSlot src={s.imageUrl ?? p.coverImage} fallback={p.cover} edit={edit} onChange={(imageUrl) => set({ imageUrl })} label="cover image" className="aspect-[4/3] rounded-3xl shadow-xl" />
      </section>
    );
  }
  const image = s.imageUrl ?? p.coverImage;
  return (
    <ImageSlot src={image} fallback={p.cover} edit={edit} onChange={(imageUrl) => set({ imageUrl })} label="cover image" clickArea={false} className="flex min-h-[460px] items-center text-white">
      <div className="absolute inset-0 bg-slate-950/40" />
      {!image && <ImageIcon className="absolute -right-10 -top-10 h-72 w-72 text-white/5" />}
      <div className={cn('relative z-10 w-full', pad, v === 1 ? 'text-center' : '')}>
        <div className={cn(v === 2 && 'max-w-xl border-l-4 bg-slate-900/80 p-8 shadow-2xl')} style={v === 2 ? { borderColor: color } : undefined}>
          {customer && <p className="mb-4 text-xs font-bold uppercase tracking-[0.3em] text-white/70">Prepared for {fullName(customer)}</p>}
          <h1 className={titleCls} style={{ fontFamily: p.branding?.headingFont }}>
            <Editable edit={edit} value={s.content} onChange={(content) => set({ content })} className={v === 1 ? 'text-center' : ''} />
          </h1>
          <p className={cn('mt-4 text-lg text-white/80', v === 1 && 'mx-auto max-w-2xl')}>
            <Editable edit={edit} value={s.subtitle ?? ''} onChange={(subtitle) => set({ subtitle })} placeholder="Subtitle" className={v === 1 ? 'text-center' : ''} />
          </p>
          <span className="mt-8 inline-block rounded-full px-6 py-3 text-sm font-bold text-white shadow-lg" style={{ backgroundColor: color }}>View Proposal</span>
        </div>
      </div>
    </ImageSlot>
  );
}

function EstimateBlock({ ctx }: { ctx: SectionCtx }) {
  const { p, color, edit } = ctx;
  const look = useLookups();
  const est = useCanvasEstimate(ctx);
  const customer = look.customer(est?.customerId ?? p.customerId);
  if (!est) {
    return (
      <section className={cn(pad, shell(ctx))}>
        <Heading ctx={ctx} />
        <div className="rounded-2xl border border-dashed border-gray-300 p-10 text-center text-sm text-gray-400">
          {edit ? 'Link an estimate in the Settings tab to show your proposal and pricing here.' : 'Your detailed proposal will appear here.'}
        </div>
      </section>
    );
  }
  const t = estimateTotals(est);
  return (
    <section className={cn(pad, shell(ctx))}>
      <Heading ctx={ctx} />
      <div className="mb-8 grid gap-4 text-sm @3xl:grid-cols-3">
        <Info label="Client" value={fullName(customer)} />
        <Info label="Job Address" value={est.address} />
        <Info label="Estimate" value={`${est.estimateNumber} • ${longDate(est.date)}`} />
      </div>
      <div className="space-y-6">
        {est.areas.map((a) => {
          const rows = customerLines(est, a.id);
          if (!rows.length) return null;
          const total = rows.reduce((sum, l) => sum + l.total, 0);
          return (
            <div key={a.id} className="overflow-hidden rounded-2xl border border-gray-200 bg-white text-gray-900">
              <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
                <h3 className="font-heading text-lg font-bold">{a.name}</h3>
                <span className="font-bold">{money(total)}</span>
              </div>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-gray-50">
                  {rows.map((l) => (
                    <tr key={l.id}>
                      <td className="px-6 py-3 font-medium">{l.surfaceType}</td>
                      <td className="px-3 py-3 text-gray-500">{l.quantity} {l.unit}</td>
                      <td className="hidden px-3 py-3 text-gray-500 @3xl:table-cell">{l.coats} coats{l.paintName ? ` • ${l.paintName}` : ''}</td>
                      <td className="px-6 py-3 text-right font-semibold">{money(l.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
      <div className="mt-8 ml-auto w-full max-w-sm space-y-2 rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-900">
        <Line label="Subtotal" value={money(t.subtotal)} />
        {t.discount > 0 && <Line label="Discount" value={`-${money(t.discount)}`} />}
        {t.tax > 0 && <Line label={`Tax (${est.taxRate}%)`} value={money(t.tax)} />}
        <div className="flex items-end justify-between border-t border-gray-100 pt-3">
          <span className="text-xs font-black uppercase tracking-widest">Total</span>
          <span className="text-3xl font-black" style={{ color }}>{money(t.total)}</span>
        </div>
        <Link href={`/estimates/${est.id}/client-view`} onClick={(e) => edit && e.preventDefault()} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl py-3 font-bold text-white" style={{ backgroundColor: color }}>
          <CheckCircle2 className="h-4 w-4" /> Review & Approve
        </Link>
      </div>
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-gray-50 p-4 text-gray-900">
      <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{label}</div>
      <div className="mt-1 font-semibold">{value}</div>
    </div>
  );
}
function Line({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between text-gray-500"><span>{label}</span><span className="font-semibold text-gray-900">{value}</span></div>;
}

function Services({ ctx }: { ctx: SectionCtx }) {
  const items = parseItems(ctx.s.content);
  const v = ctx.s.variant ?? 1;
  const Icon = SECTION_META.services.icon;
  if (v === 2) {
    return (
      <section className={cn(pad, shell(ctx))}>
        <Heading ctx={ctx} />
        <div className="space-y-6">
          {items.map((it, i) => (
            <div key={i} className="flex gap-6 border-b border-white/10 pb-6">
              <span className="text-sm font-black" style={{ color: ctx.color }}>{String(i + 1).padStart(2, '0')}</span>
              <div><h3 className="font-heading text-xl font-bold">{it.title}</h3><p className="mt-1 text-white/60">{it.text}</p></div>
            </div>
          ))}
        </div>
      </section>
    );
  }
  return (
    <section className={cn(pad, shell(ctx))}>
      <Heading ctx={ctx} center />
      <div className={cn('grid gap-6', v === 3 ? '@3xl:grid-cols-4 @lg:grid-cols-2' : '@3xl:grid-cols-3 @lg:grid-cols-2')}>
        {items.map((it, i) => (
          <div key={i} className={cn('rounded-2xl border p-6', ctx.dark ? 'border-white/10 bg-white/5' : 'border-gray-100 bg-white shadow-sm')}>
            <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl" style={{ backgroundColor: `${ctx.color}1a`, color: ctx.color }}><Icon className="h-6 w-6" /></span>
            <h3 className="font-heading text-lg font-bold">{it.title}</h3>
            {it.text && <p className={cn('mt-2 text-sm', ctx.dark ? 'text-white/60' : 'text-gray-500')}>{it.text}</p>}
          </div>
        ))}
      </div>
    </section>
  );
}

const TILE_GRADIENTS = [
  'linear-gradient(135deg,#cbd5e1,#64748b)', 'linear-gradient(135deg,#fde68a,#d97706)',
  'linear-gradient(135deg,#bfdbfe,#2563eb)', 'linear-gradient(135deg,#bbf7d0,#059669)',
  'linear-gradient(135deg,#fbcfe8,#db2777)', 'linear-gradient(135deg,#ddd6fe,#7c3aed)',
];

function Gallery({ ctx }: { ctx: SectionCtx }) {
  const items = parseItems(ctx.s.content);
  const v = ctx.s.variant ?? 1;
  const setImage = (i: number, url: string | undefined) => {
    const next = [...(ctx.s.itemImages ?? [])];
    while (next.length <= i) next.push(null);
    next[i] = url ?? null;
    ctx.set({ itemImages: next });
  };
  return (
    <section className={cn(pad, shell(ctx))}>
      <Heading ctx={ctx} center />
      <div className={cn('grid gap-6', v === 2 ? '@3xl:grid-cols-3' : '@lg:grid-cols-2')}>
        {items.map((it, i) => (
          <figure key={i} className="group/tile overflow-hidden rounded-2xl">
            <ImageSlot src={ctx.s.itemImages?.[i]} fallback={TILE_GRADIENTS[i % TILE_GRADIENTS.length]!} edit={ctx.edit} onChange={(u) => setImage(i, u)} label={`${it.title || 'gallery'} image`} className="aspect-[4/3]">
              {!ctx.s.itemImages?.[i] && <ImageIcon className="absolute left-1/2 top-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2 text-white/40" />}
              {v !== 3 && (
                <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-5 text-white">
                  <div className="font-heading text-lg font-bold">{it.title}</div>
                  {it.text && <div className="text-sm text-white/80">{it.text}</div>}
                </figcaption>
              )}
            </ImageSlot>
            {v === 3 && (
              <figcaption className="pt-3">
                <div className="font-heading font-bold">{it.title}</div>
                <div className="text-sm text-gray-500">{it.text}</div>
              </figcaption>
            )}
          </figure>
        ))}
      </div>
    </section>
  );
}

function Reviews({ ctx }: { ctx: SectionCtx }) {
  const items = parseItems(ctx.s.content);
  return (
    <section className={cn(pad, shell(ctx) || (ctx.dark ? '' : 'bg-gray-50'))}>
      <Heading ctx={ctx} center />
      <div className="grid gap-6 @3xl:grid-cols-3">
        {items.map((it, i) => (
          <blockquote key={i} className={cn('rounded-2xl p-6', ctx.s.variant === 2 ? 'bg-white/5' : 'bg-white text-gray-900 shadow-sm')}>
            <Quote className="h-6 w-6" style={{ color: ctx.color }} />
            <div className="mt-3 flex gap-0.5 text-amber-400">{Array.from({ length: 5 }).map((_, k) => <Star key={k} className="h-4 w-4 fill-current" />)}</div>
            <p className="mt-3 text-sm leading-relaxed opacity-80">“{it.text || it.title}”</p>
            {it.text && <footer className="mt-4 text-sm font-bold">{it.title}</footer>}
          </blockquote>
        ))}
      </div>
    </section>
  );
}

function About({ ctx }: { ctx: SectionCtx }) {
  const { s, edit, set, color, p } = ctx;
  const [biz] = useSingleton('businessProfile');
  return (
    <section className={cn('grid items-center gap-12 @3xl:grid-cols-2', pad, shell(ctx))}>
      <div className={cn('relative aspect-square', s.variant === 3 && '@3xl:order-2')}>
        <ImageSlot src={s.imageUrl} fallback={p.cover} edit={edit} onChange={(imageUrl) => set({ imageUrl })} label="photo" className="absolute inset-0 rounded-3xl" />
        <div className="absolute -bottom-6 left-6 z-10 rounded-2xl bg-white p-5 text-gray-900 shadow-xl">
          <div className="flex items-center gap-2 text-sm font-bold"><Shield className="h-4 w-4" style={{ color }} /> Fully Licensed & Insured</div>
          <div className="text-xs text-gray-500">License #{biz.licenseNumber}</div>
        </div>
      </div>
      <div>
        <Heading ctx={ctx} />
        <p className={cn('-mt-4 leading-relaxed', ctx.dark || s.variant === 2 ? 'text-white/70' : 'text-gray-600')}>
          <Editable edit={edit} multiline value={s.content} onChange={(content) => set({ content })} />
        </p>
        <div className="mt-8 grid grid-cols-2 gap-6">
          {[['15+', 'Years Experience'], ['500+', 'Projects Completed']].map(([v, l]) => (
            <div key={l}>
              <div className="font-heading text-4xl font-black" style={{ color }}>{v}</div>
              <div className="mt-1 text-[10px] font-bold uppercase tracking-widest opacity-60">{l}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Owner({ ctx }: { ctx: SectionCtx }) {
  const { s, edit, set, color } = ctx;
  const { items: team } = useCollection('team');
  const owner = team.find((t) => t.role === 'Owner') ?? team[0];
  return (
    <section className={cn('grid items-center gap-10 @3xl:grid-cols-[280px_1fr]', pad, shell(ctx))}>
      <div className="mx-auto flex aspect-square w-56 items-center justify-center rounded-full font-heading text-6xl font-black text-white shadow-xl" style={{ backgroundColor: owner?.color ?? color }}>
        {owner ? initials(fullName(owner)) : '?'}
      </div>
      <div>
        <Heading ctx={ctx} />
        <div className="-mt-6 mb-4 font-heading text-xl font-bold">{owner ? fullName(owner) : 'Owner Name'}</div>
        <p className={cn('leading-relaxed', ctx.dark || s.variant === 2 ? 'text-white/70' : 'text-gray-600')}>
          <Editable edit={edit} multiline value={s.content} onChange={(content) => set({ content })} />
        </p>
      </div>
    </section>
  );
}

function WhyUs({ ctx }: { ctx: SectionCtx }) {
  const items = parseItems(ctx.s.content);
  return (
    <section className={cn(pad, shell(ctx))}>
      <Heading ctx={ctx} center />
      <div className="grid gap-6 @3xl:grid-cols-2">
        {items.map((it, i) => (
          <div key={i} className="flex gap-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-black text-white" style={{ backgroundColor: ctx.color }}>{i + 1}</span>
            <div>
              <h3 className="font-heading text-lg font-bold">{it.title}</h3>
              {it.text && <p className="mt-1 text-sm opacity-70">{it.text}</p>}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Terms({ ctx }: { ctx: SectionCtx }) {
  const { s, edit, set, color } = ctx;
  const { items: terms } = useCollection('termsConditions');
  const def = terms.find((t) => t.isDefault);
  return (
    <section className={cn(pad, shell(ctx) || (ctx.dark ? '' : 'bg-gray-50'))}>
      <div className="mb-6 flex items-center gap-3">
        <Shield className="h-6 w-6" style={{ color }} />
        <h2 className="font-heading text-2xl font-extrabold"><Editable edit={edit} value={s.title} onChange={(title) => set({ title })} /></h2>
      </div>
      <p className="mb-6 font-semibold"><Editable edit={edit} multiline value={s.content} onChange={(content) => set({ content })} /></p>
      {def && <p className="whitespace-pre-line text-xs leading-relaxed opacity-60">{def.content}</p>}
    </section>
  );
}

function Custom({ ctx }: { ctx: SectionCtx }) {
  const { s, edit, set } = ctx;
  return (
    <section className={cn(pad, 'text-center', shell(ctx))}>
      <Heading ctx={ctx} center />
      <p className="mx-auto -mt-4 max-w-3xl leading-relaxed opacity-80">
        <Editable edit={edit} multiline value={s.content} onChange={(content) => set({ content })} className="text-center" />
      </p>
    </section>
  );
}
