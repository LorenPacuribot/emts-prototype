'use client';

/*
  Settings > My Profile. Matches the live screen: Appearance (dark mode toggle),
  profile photo card, Personal Details form, and Security (change password modal).
  Reads and writes the `userProfile` singleton. The photo is stored as a data URL.
*/
import React, { useRef, useState } from 'react';
import { Camera, Lock, Moon, Save, Sun, User } from 'lucide-react';
import { SettingsPage } from '@/components/settings/SettingsSidebar';
import { Button } from '@/components/ui/button';
import { Field, Input, Switch } from '@/components/ui/form';
import { Modal } from '@/components/Modals/Modal';
import { useToast } from '@/components/ui/toast';
import { useSingleton } from '@/lib/store';
import { digitsOnly, formatPhone, readImageFile, SettingsCard } from '@/components/settings/config/ui';

export function MyProfileView() {
  const [profile, setProfile] = useSingleton('userProfile');
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({ firstName: profile.firstName, lastName: profile.lastName, phone: digitsOnly(profile.phone) });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [photo, setPhoto] = useState(profile.photoUrl ?? '');
  const [photoError, setPhotoError] = useState('');
  const [pwOpen, setPwOpen] = useState(false);

  const set = (k: keyof typeof form, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: '' }));
  };

  const save = () => {
    const next: Record<string, string> = {};
    if (!form.firstName.trim()) next.firstName = 'First name is required';
    if (form.phone && form.phone.length < 10) next.phone = 'Phone number must be 10 digits';
    setErrors(next);
    if (Object.keys(next).length) {
      toast('Please fix the validation errors', 'error');
      return;
    }
    setProfile({ firstName: form.firstName.trim(), lastName: form.lastName.trim(), phone: form.phone, photoUrl: photo || undefined });
    toast('Profile updated successfully');
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPhotoError('');
    const res = await readImageFile(file, 5);
    if (res.error) return setPhotoError(res.error);
    setPhoto(res.url!);
  };

  const removePhoto = () => {
    setPhoto('');
    setPhotoError('');
    if (profile.photoUrl) {
      setProfile({ photoUrl: undefined });
      toast('Profile photo removed successfully');
    }
  };

  const dark = !!profile.darkMode;

  return (
    <SettingsPage title="My Profile" subtitle="Manage your personal information and login credentials.">
      <div className="space-y-8">
        <SettingsCard title="Appearance" icon={dark ? <Moon className="text-indigo-400" /> : <Sun className="text-amber-500" />}>
          <div className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50 p-4">
            <div>
              <div className="text-sm font-bold text-gray-900">Dark Mode</div>
              <p className="text-xs text-gray-500">Switch between light and dark interface themes.</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs font-medium text-gray-500">{dark ? 'On' : 'Off'}</span>
              <Switch checked={dark} onChange={(v) => setProfile({ darkMode: v })} label="Dark mode" />
            </div>
          </div>
        </SettingsCard>

        <SettingsCard>
          <div className="flex flex-col items-center gap-8 md:flex-row">
            <button type="button" onClick={() => fileRef.current?.click()} className="group relative shrink-0" aria-label="Change photo">
              <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border-4 border-gray-50 bg-gray-100 shadow-xl">
                {photo ? <img src={photo} alt="Profile" className="h-full w-full object-cover" /> : <User className="h-10 w-10 text-gray-300" />}
              </div>
              <div className="absolute inset-0 flex flex-col items-center justify-center rounded-full bg-black/40 text-white opacity-0 transition-opacity group-hover:opacity-100">
                <Camera className="mb-1 h-5 w-5" />
                <span className="text-xxs font-black uppercase tracking-widest">Change</span>
              </div>
            </button>
            <div className="flex-1 text-center md:text-left">
              <h3 className="mb-2 font-heading text-xl font-bold text-gray-900">{profile.firstName} {profile.lastName}</h3>
              <p className="text-sm text-gray-500">User profile photo is visible to clients in estimates and work orders.</p>
              <p className="mt-1 text-xs text-gray-400">Maximum file size: 5MB. Supported formats: JPG, PNG, GIF, WebP</p>
              <div className="mt-5 flex flex-wrap justify-center gap-3 md:justify-start">
                <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()}>Upload New</Button>
                <Button size="sm" variant="ghost" className="text-red-500 hover:bg-red-50 hover:text-red-600" disabled={!photo} onClick={removePhoto}>
                  Remove Photo
                </Button>
              </div>
              {photoError && <p className="mt-3 text-sm text-red-500">{photoError}</p>}
            </div>
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
        </SettingsCard>

        <SettingsCard title="Personal Details" className="space-y-0">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <Field label="First Name" required error={errors.firstName}>
              <Input value={form.firstName} placeholder="Jane" invalid={!!errors.firstName} onChange={(e) => set('firstName', e.target.value)} onClear={() => set('firstName', '')} />
            </Field>
            <Field label="Last Name">
              <Input value={form.lastName} placeholder="Doe" onChange={(e) => set('lastName', e.target.value)} onClear={() => set('lastName', '')} />
            </Field>
            <Field label="Email Address">
              <Input value={profile.email} placeholder="jane@example.com" disabled readOnly />
            </Field>
            <Field label="Phone Number" error={errors.phone}>
              <Input
                value={formatPhone(form.phone)}
                placeholder="(555) 123-4567"
                invalid={!!errors.phone}
                onChange={(e) => set('phone', digitsOnly(e.target.value))}
                onClear={() => set('phone', '')}
              />
            </Field>
          </div>
          <div className="flex justify-end pt-7">
            <Button onClick={save} className="px-8" icon={<Save className="h-4 w-4" />}>Save Profile</Button>
          </div>
        </SettingsCard>

        <SettingsCard title="Security" icon={<Lock className="text-gray-400" />}>
          <div className="flex flex-col items-center justify-between gap-4 rounded-2xl border border-gray-100 bg-gray-50 p-5 md:flex-row">
            <div className="text-sm font-bold text-gray-900">Change Password</div>
            <Button variant="secondary" onClick={() => setPwOpen(true)}>Update Password</Button>
          </div>
        </SettingsCard>
      </div>

      <ChangePasswordModal open={pwOpen} onOpenChange={setPwOpen} />
    </SettingsPage>
  );
}

/** Change Password modal. Validates like the live zod schema and checks the mock stored password. */
function ChangePasswordModal({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [profile, setProfile] = useSingleton('userProfile');
  const { toast } = useToast();
  const empty = { currentPassword: '', newPassword: '', confirmPassword: '' };
  const [state, setState] = useState(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const change = (k: keyof typeof empty, v: string) => {
    setState((s) => ({ ...s, [k]: v }));
    setErrors((e) => ({ ...e, [k]: '' }));
  };

  const close = (v: boolean) => {
    if (!v) {
      setState(empty);
      setErrors({});
    }
    onOpenChange(v);
  };

  const submit = () => {
    const e: Record<string, string> = {};
    if (!state.currentPassword) e.currentPassword = 'Current password is required';
    else if (profile.password && state.currentPassword !== profile.password) e.currentPassword = 'Current password is incorrect';
    if (state.newPassword.length < 8) e.newPassword = 'Password must be at least 8 characters';
    else if (state.newPassword === state.currentPassword) e.newPassword = 'New password must be different from the current password';
    if (!state.confirmPassword) e.confirmPassword = 'Please confirm your password';
    else if (state.newPassword !== state.confirmPassword) e.confirmPassword = "Passwords don't match";
    setErrors(e);
    if (Object.keys(e).length) return;
    setProfile({ password: state.newPassword });
    toast('Password updated successfully');
    close(false);
  };

  return (
    <Modal open={open} onOpenChange={close} title="Change Password" size="md">
      <div className="flex flex-col gap-5">
        <Field label="Current Password" required error={errors.currentPassword} hint="Demo password: password123">
          <Input type="password" value={state.currentPassword} placeholder="Enter current password" invalid={!!errors.currentPassword} onChange={(e) => change('currentPassword', e.target.value)} />
        </Field>
        <Field label="New Password" required error={errors.newPassword}>
          <Input type="password" value={state.newPassword} placeholder="Enter new password" invalid={!!errors.newPassword} onChange={(e) => change('newPassword', e.target.value)} />
        </Field>
        <Field label="Confirm New Password" required error={errors.confirmPassword}>
          <Input type="password" value={state.confirmPassword} placeholder="Confirm new password" invalid={!!errors.confirmPassword} onChange={(e) => change('confirmPassword', e.target.value)} />
        </Field>
        <div className="flex gap-3 pt-1">
          <Button variant="secondary" className="flex-1" onClick={() => close(false)}>Cancel</Button>
          <Button className="flex-1" onClick={submit}>Update Password</Button>
        </div>
      </div>
    </Modal>
  );
}
