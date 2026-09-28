import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';
import { Sidebar, MobileSidebar } from '@/components/Sidebar';

export const metadata: Metadata = {
  title: 'Estimate Master - Precision Tools',
  description: 'Estimate Master (EMTS) replica with local mock data.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <div className="flex h-screen bg-gray-50">
            <Sidebar />
            <MobileSidebar />
            <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-gray-50">{children}</div>
          </div>
        </Providers>
      </body>
    </html>
  );
}
