'use client';

/*
  Settings > Business Profile. Company Information form (with the live app's
  validation rules and a timezone picker) and Visual Identity (primary and
  inverted logo upload boxes). Both "Save Business Info" and "Apply Branding"
  save the whole form to the `businessProfile` singleton, like the live app.
*/
import React, { useMemo, useRef, useState } from 'react';
import { Building2, Info, Palette, Pencil, Save, Upload, X } from 'lucide-react';
import { SettingsPage } from '@/components/settings/SettingsSidebar';
import { Button } from '@/components/ui/button';
import { Field, Input, Label, NativeSelect } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import { useSingleton } from '@/lib/store';
import { cn } from '@/lib/utils';
import { digitsOnly, formatPhone, readImageFile, SettingsCard } from '@/components/settings/config/ui';

/** "UTC (GMT+00:00)" style labels for every IANA zone the browser knows, sorted by offset. */
function useTimezoneOptions() {
  return useMemo(() => {
    let zones: string[] = [];
    try {
      zones = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') ?? [];
    } catch {
      zones = [];
    }
    if (!zones.includes('UTC')) zones = ['UTC', ...zones];
    const offsetOf = (tz: string) => {
      try {
        const part = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' })
          .formatToParts(new Date())
          .find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
        return part === 'GMT' ? 'GMT+00:00' : part;
      } catch {
        return 'GMT+00:00';
      }
    };
    const secs = (o: string) => {
      const m = o.match(/GMT([+-])(\d{2}):(\d{2})/);
      return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
    };
    return zones
      .map((tz) => ({ value: tz, offset: offsetOf(tz) }))
      .sort((a, b) => secs(a.offset) - secs(b.offset) || a.value.localeCompare(b.value))
      .map((z) => ({ value: z.value, label: `${z.value.replace(/_/g, ' ')} (${z.offset})` }));
  }, []);
}

const isValidWebsite = (val: string) => {
  if (!val) return true;
  try {
    const url = new URL(/^https?:\/\//i.test(val) ? val : `https://${val}`);
    return url.hostname.includes('.');
  } catch {
    return false;
  }
};

export function BusinessProfileView() {
  const [bp, setBp] = useSingleton('businessProfile');
  const { toast } = useToast();
  const tzOptions = useTimezoneOptions();

  const [form, setForm] = useState({
    name: bp.legalName || bp.companyName,
    street: bp.street,
    city: bp.city,
    state: bp.state,
    zip: bp.zip,
    timezone: bp.timezone || 'UTC',
    phone: digitsOnly(bp.phone),
    email: bp.email,
    website: bp.website,
    licenseNumber: bp.licenseNumber,
    reviewLink: bp.reviewLink ?? '',
  });
  const [logo, setLogo] = useState(bp.logoUrl ?? '');
  const [logoInv, setLogoInv] = useState(bp.logoInvertedUrl ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = (k: keyof typeof form, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: '' }));
  };

  const save = () => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = 'Business name is required';
    if (!form.street.trim()) e.street = 'Street address is required';
    if (!form.city.trim()) e.city = 'City is required';
    if (form.state.length !== 2) e.state = 'Use 2-letter state code';
    if (form.zip.length < 5) e.zip = 'ZIP code must be at least 5 digits';
    if (form.phone && form.phone.length < 10) e.phone = 'Phone number must be at least 10 digits';
    if (!form.email.trim()) e.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Invalid email address';
    if (!isValidWebsite(form.website.trim())) e.website = 'Website must be a valid URL';
    if (form.reviewLink.trim() && !isValidWebsite(form.reviewLink.trim())) e.reviewLink = 'Review link must be a valid URL';
    setErrors(e);
    if (Object.keys(e).length) {
      toast('Please fix the validation errors', 'error');
      return;
    }
    setBp({
      companyName: form.name.trim(),
      legalName: form.name.trim(),
      street: form.street.trim(),
      city: form.city.trim(),
      state: form.state,
      zip: form.zip.trim(),
      timezone: form.timezone,
      phone: form.phone,
      email: form.email.trim(),
      website: form.website.trim(),
      licenseNumber: form.licenseNumber.trim(),
      reviewLink: form.reviewLink.trim() || undefined,
      logoUrl: logo || undefined,
      logoInvertedUrl: logoInv || undefined,
    });
    toast('Business profile updated successfully');
  };

  const clearable = (k: keyof typeof form) => ({
    value: form[k],
    invalid: !!errors[k],
    onChange: (ev: React.ChangeEvent<HTMLInputElement>) => set(k, ev.target.value),
    onClear: () => set(k, ''),
  });

  return (
    <SettingsPage title="Business Profile" subtitle="Manage your organizational identity and branding standards.">
      <div className="space-y-8">
        <SettingsCard title="Company Information" icon={<Building2 className="text-gray-500" />}>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <Field label="Legal Business Name" className="md:col-span-2" error={errors.name}>
              <Input placeholder="Pro Painters LLC" {...clearable('name')} />
            </Field>
            <Field label="Street Address" className="md:col-span-2" error={errors.street}>
              <Input placeholder="123 Main Street" {...clearable('street')} />
            </Field>
            <div className="grid grid-cols-2 gap-4 md:col-span-2 md:grid-cols-3">
              <Field label="City" error={errors.city}>
                <Input placeholder="Austin" {...clearable('city')} />
              </Field>
              <Field label="State" error={errors.state}>
                <Input placeholder="TX" maxLength={2} {...clearable('state')} onChange={(ev) => set('state', ev.target.value.toUpperCase())} />
              </Field>
              <Field label="Zip" error={errors.zip}>
                <Input placeholder="78701" {...clearable('zip')} />
              </Field>
            </div>
            <div className="md:col-span-2">
              <div className="mb-1.5 flex items-center gap-1">
                <Label className="mb-0">Business Timezone</Label>
                <span title="All reports, dashboards, date filters and customer-facing emails anchor on this timezone. Calendar dates (e.g. estimate dates, shift dates) are not affected.">
                  <Info className="h-3.5 w-3.5 cursor-help text-blue-500" />
                </span>
              </div>
              <NativeSelect value={form.timezone} onChange={(ev) => set('timezone', ev.target.value)}>
                {tzOptions.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </NativeSelect>
            </div>
            <Field label="Business Phone" error={errors.phone}>
              <Input
                value={formatPhone(form.phone)}
                invalid={!!errors.phone}
                placeholder="(555) 987-6543"
                onChange={(ev) => set('phone', digitsOnly(ev.target.value))}
                onClear={() => set('phone', '')}
              />
            </Field>
            <Field label="Primary Contact Email" required error={errors.email}>
              <Input type="email" placeholder="info@propainters.com" {...clearable('email')} />
            </Field>
            <Field label="Website URL" error={errors.website}>
              <Input placeholder="https://www.propainters.com" {...clearable('website')} />
            </Field>
            <Field label="Review link" error={errors.reviewLink} hint="Where customers leave a review. Used by the review request message ({{reviewLink}}).">
              <Input placeholder="https://g.page/r/your-business/review" {...clearable('reviewLink')} />
            </Field>
            <Field label="License / Registration #">
              <Input placeholder="TX-12345-LLC" {...clearable('licenseNumber')} />
            </Field>
          </div>
          <div className="mt-6 flex justify-end border-t border-gray-100 pt-4">
            <Button onClick={save} className="px-8" icon={<Save className="h-4 w-4" />}>Save Business Info</Button>
          </div>
        </SettingsCard>

        <SettingsCard title="Visual Identity" icon={<Palette className="text-gray-500" />}>
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
            <LogoBox label="Primary Logo" value={logo} onChange={setLogo} description="PNG, SVG preferred (Max 2MB)" />
            <LogoBox label="Inverted Logo" value={logoInv} onChange={setLogoInv} dark description="Used on dark headers & reports" />
          </div>
          <div className="flex justify-end pt-8">
            <Button onClick={save} icon={<Save className="h-4 w-4" />}>Apply Branding</Button>
          </div>
        </SettingsCard>
      </div>
    </SettingsPage>
  );
}

/** Dashed upload box. With a logo, hovering shows Replace and remove (x) buttons. */
function LogoBox({ label, value, onChange, dark, description }: { label: string; value: string; onChange: (v: string) => void; dark?: boolean; description: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const res = await readImageFile(file, 2);
    if (res.error) return setError(res.error);
    setError('');
    onChange(res.url!);
  };
  return (
    <div>
      <Label>{label}</Label>
      <div
        className={cn(
          'group relative flex aspect-video flex-col items-center justify-center overflow-hidden rounded-2xl border-2 transition-all',
          dark ? 'border-gray-700 bg-gray-900' : 'border-gray-200 bg-gray-50 hover:border-primary-300',
          value ? 'border-solid' : 'border-dashed',
          error && 'border-red-300',
        )}
      >
        {value ? (
          <>
            <img src={value} alt={label} className="max-h-full max-w-full object-contain p-8" />
            <div className={cn('absolute inset-0 flex items-center justify-center gap-3 opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100', dark ? 'bg-gray-900/60' : 'bg-white/60')}>
              <Button size="sm" variant="secondary" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => ref.current?.click()}>Replace</Button>
              <button type="button" onClick={() => onChange('')} className="rounded-lg bg-red-600 p-2 text-white shadow-lg hover:bg-red-700" aria-label={`Remove ${label}`}>
                <X className="h-4 w-4" />
              </button>
            </div>
          </>
        ) : (
          <button type="button" onClick={() => ref.current?.click()} className="flex h-full w-full flex-col items-center justify-center gap-3 p-6 text-center">
            <span className={cn('flex h-12 w-12 items-center justify-center rounded-xl transition-transform group-hover:scale-110', dark ? 'bg-gray-800 text-gray-500' : 'bg-white text-gray-300 shadow-sm group-hover:text-primary-500')}>
              <Upload className="h-6 w-6" />
            </span>
            <span className={cn('block text-xs font-black uppercase tracking-widest', dark ? 'text-gray-500' : 'text-gray-500')}>Upload {label}</span>
            <span className={cn('block text-xs font-medium', dark ? 'text-gray-600' : 'text-gray-500')}>{description}</span>
          </button>
        )}
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={onFile} />
    </div>
  );
}
