import { redirect } from 'next/navigation';

// The live app opens Settings on "My Profile".
export default function SettingsIndex() {
  redirect('/settings/my-profile');
}
