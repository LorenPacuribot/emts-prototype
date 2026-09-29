import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';
import { Sidebar, MobileSidebar } from '@/components/Sidebar';
import { AppFrame } from '@/components/auth/AuthGate';

export const metadata: Metadata = {
  title: 'Estimate Master - Precision Tools',
  description: 'Estimate Master (EMTS) replica with local mock data.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <AppFrame
            sidebar={
              <>
                <Sidebar />
                <MobileSidebar />
              </>
            }
          >
            {children}
          </AppFrame>
        </Providers>
      </body>
    </html>
  );
}
