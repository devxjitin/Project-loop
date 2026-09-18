import { SessionProvider } from '@/components/auth-session';
import { DashboardShell } from '@/components/dashboard-shell';
import { ToastProvider } from '@/components/ui/toast';
export default function DashboardLayout({ children }: { children: React.ReactNode }) { return <SessionProvider><ToastProvider><DashboardShell>{children}</DashboardShell></ToastProvider></SessionProvider>; }
