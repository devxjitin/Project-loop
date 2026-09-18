import { SessionProvider } from '@/components/auth-session';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
