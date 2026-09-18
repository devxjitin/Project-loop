import type { Metadata } from 'next';
import './globals.css';
import { NotificationProvider } from '@/components/notification';

export const metadata: Metadata = { title: 'LOOP', description: 'Voice of customer intelligence' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><NotificationProvider>{children}</NotificationProvider></body></html>;
}
