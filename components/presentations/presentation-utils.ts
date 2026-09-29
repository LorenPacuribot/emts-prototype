/*
  Shared data for the Presentation Builder:
  - THEMES: the four presentation themes (blue / purple / green / dark).
  - BRAND_COLORS, HEADING_FONTS, BODY_FONTS: the live "Branding" tab options.
  - SECTION_META: label, icon and starter content for each block type.
    Sidebar labels follow the live builder ("Hero Headers", "Expertise",
    "Portfolio", "Client Reviews", "Artisan Story", ...).
  - Helpers to build a new presentation and to split section content into
    list items (one item per line, "Title: description").
*/
import {
  Award, Building2, ClipboardList, DollarSign, FileSignature, FileText, Home, Image as ImageIcon, LayoutTemplate, ListOrdered, ListPlus, Paintbrush, Palette, Shield,
  Star, Users, type LucideIcon,
} from 'lucide-react';
import type { Presentation, PresentationSection, PresentationSectionType } from '@/lib/types';
import { uid } from '@/lib/utils';

export const THEMES: Record<Presentation['theme'], { label: string; color: string; cover: string; dark: boolean }> = {
  blue: { label: 'Blue', color: '#2563eb', cover: 'linear-gradient(135deg,#1e3a8a 0%,#2563eb 55%,#60a5fa 100%)', dark: false },
  purple: { label: 'Purple', color: '#7c3aed', cover: 'linear-gradient(135deg,#312e81 0%,#7a5fff 55%,#c2b7ff 100%)', dark: false },
  green: { label: 'Green', color: '#10b981', cover: 'linear-gradient(135deg,#064e3b 0%,#10b981 55%,#a7f3d0 100%)', dark: false },
  dark: { label: 'Dark', color: '#f59e0b', cover: 'linear-gradient(135deg,#0f172a 0%,#1e293b 55%,#475569 100%)', dark: true },
};

export const BRAND_COLORS = [
  { name: 'Royal Blue', value: '#2563eb' },
  { name: 'Emerald', value: '#10b981' },
  { name: 'Slate', value: '#334155' },
  { name: 'Rose', value: '#e11d48' },
  { name: 'Amber', value: '#d97706' },
  { name: 'Indigo', value: '#4f46e5' },
  { name: 'Violet', value: '#7c3aed' },
  { name: 'Ebony', value: '#111827' },
];

export const HEADING_FONTS = [
  { name: 'Manrope (Modern)', value: "'Manrope', sans-serif" },
  { name: 'Montserrat (Bold)', value: "'Montserrat', sans-serif" },
  { name: 'Playfair (Elegant)', value: "'Playfair Display', serif" },
  { name: 'Inter (Clean)', value: "'Inter', sans-serif" },
  { name: 'Georgia (Classic)', value: 'Georgia, serif' },
];

export const BODY_FONTS = [
  { name: 'Roboto', value: "'Roboto', sans-serif" },
  { name: 'Inter', value: "'Inter', sans-serif" },
  { name: 'Open Sans', value: "'Open Sans', sans-serif" },
  { name: 'Lato', value: "'Lato', sans-serif" },
  { name: 'System', value: 'system-ui, sans-serif' },
];

/** Cover gradients offered when creating/duplicating (we have no photos). */
export const COVER_GRADIENTS = [
  THEMES.blue.cover,
  'linear-gradient(135deg,#7c2d12 0%,#ea580c 55%,#fdba74 100%)',
  THEMES.purple.cover,
  THEMES.green.cover,
  THEMES.dark.cover,
];

export interface SectionMeta {
  label: string;
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  content: string;
}

export const SECTION_META: Record<PresentationSectionType, SectionMeta> = {
  cover: { label: 'Hero Headers', icon: ImageIcon, title: 'Cover', content: 'Refining the Art of Finishing', subtitle: 'A complete vision for your project.' },
  about: {
    label: 'Artisan Story', icon: Users, title: 'About Us',
    content: "We believe that your home is your sanctuary. That's why our team of licensed and insured professionals treats every project with respect, a clean workspace and a flawless finish.",
    subtitle: 'Founded with a simple mission: superior results and unmatched service.',
  },
  services: {
    label: 'Expertise', icon: Paintbrush, title: 'Our Core Expertise', subtitle: 'Delivering precision across every dimension of finishing.',
    content: 'Interior Painting: Walls, ceilings, trim and doors with clean lines.\nExterior Painting: Siding, trim and decks protected from the elements.\nCabinet Refinishing: Factory-smooth sprayed finish for kitchens and baths.\nDrywall Repair: Patch, texture and prep before paint.',
  },
  gallery: {
    label: 'Portfolio', icon: ImageIcon, title: 'Masterworks Gallery', subtitle: 'A selection of our most transformative recent projects.',
    content: 'Modern Interior: Living room and kitchen repaint\nClassic Exterior: Full siding and trim repaint\nCabinet Refresh: Painted oak cabinets\nFront Door: High-gloss statement door',
  },
  testimonials: {
    label: 'Client Reviews', icon: Star, title: 'Client Perspectives',
    content: 'Sarah M.: The crew was on time, tidy and the finish is perfect.\nJames R.: Best painting company we have hired. Highly recommend.\nLinda K.: They helped us pick colors and the house looks brand new.',
  },
  process: {
    label: 'Why Choose Us', icon: Award, title: 'Why Choose Us?', subtitle: 'What working with us looks like.',
    content: 'Walkthrough & color consult: We review every surface and help you choose colors.\nProtect & prep: Floors and furniture covered, surfaces cleaned, patched and sanded.\nTwo coats of premium paint: Top-grade products for a long-lasting finish.\nFinal walkthrough: We are not finished until you are 100% satisfied.',
  },
  warranty: { label: 'Terms & Conditions', icon: Shield, title: 'Warranty', content: '2-year labor warranty against peeling, blistering and flaking.' },
  team: {
    label: 'Owner Profile', icon: Users, title: 'Meet the Team', subtitle: '(Founder/Owner)',
    content: 'Introduce yourself to your clients. Share your years of experience, what drives you, and the values that shape your work.',
  },
  estimate: { label: 'Estimate', icon: FileText, title: 'Your Estimate', content: 'Linked estimate summary and approve button.' },
  custom: {
    label: 'About Company', icon: Building2, title: 'About Our Company',
    content: 'Share your company story here. Tell clients about your mission, the quality of work you deliver, the areas you serve, and what sets your team apart.',
  },
  /* Estimate-driven blocks: the content is filled from the linked estimate in Client Preview. */
  property: { label: 'Property & Customer', icon: Home, title: 'Your Property', content: 'Customer name, job-site address and estimate details from the linked estimate.' },
  scope: { label: 'Surface Scope', icon: ClipboardList, title: 'Scope of Work', content: 'Every included surface with its location, colour, product, sheen, coats and preparation.' },
  specs: { label: 'Paint Specifications', icon: Palette, title: 'Paint Specifications', content: 'The project colour card: manufacturer, colour, product, sheen and coats.' },
  optional: { label: 'Optional Items', icon: ListPlus, title: 'Optional Items', content: 'Optional work, priced separately from the base scope.' },
  pricing: { label: 'Pricing', icon: DollarSign, title: 'Investment', content: 'Base scope total, optional items, tax and deposit from the linked estimate.' },
};

/** Blocks whose content comes from the linked estimate. */
export const ESTIMATE_BLOCKS: PresentationSectionType[] = ['property', 'scope', 'specs', 'optional', 'pricing'];

/** Block types shown in the "Blocks" tab, in the live order. Cover and Estimate are fixed. */
export const ADDABLE_TYPES: PresentationSectionType[] = ['services', 'gallery', 'testimonials', 'about', 'custom', 'team', 'process', 'warranty'];

export const BLOCKS_ICON = LayoutTemplate;
export const TERMS_ICON = FileSignature;
export const PROCESS_ICON = ListOrdered;

export function newSection(type: PresentationSectionType, variant: 1 | 2 | 3 = 1): PresentationSection {
  const m = SECTION_META[type];
  return { id: uid('sec'), type, title: m.title, subtitle: m.subtitle, content: m.content, enabled: true, variant };
}

/**
 * Starter sections for a new presentation: the cover, the estimate content
 * blocks Client Preview fills in (property, scope, specs, optional items,
 * pricing), then the company blocks.
 */
export function defaultSections(company: string): PresentationSection[] {
  const about = newSection('about');
  about.title = `About ${company}`;
  const estimate = newSection('estimate');
  estimate.enabled = false;
  return [newSection('cover'), ...ESTIMATE_BLOCKS.map((t) => newSection(t)), newSection('services'), newSection('gallery'), newSection('testimonials'), about, estimate];
}

/** Splits "Title: description" lines into items. Lines without ":" become titles. */
export function parseItems(content: string): { title: string; text: string }[] {
  return content
    .split('\n')
    .map((l) => l.trim().replace(/^\d+[.)]\s*/, ''))
    .filter(Boolean)
    .map((l) => {
      const i = l.indexOf(':');
      return i > 0 ? { title: l.slice(0, i).trim(), text: l.slice(i + 1).trim() } : { title: l, text: '' };
    });
}

export function primaryColorOf(p: Presentation) {
  return p.branding?.primaryColor ?? THEMES[p.theme].color;
}
