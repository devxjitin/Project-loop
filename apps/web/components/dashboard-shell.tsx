"use client";

import {
  BarChart3,
  Bot,
  ChevronDown,
  FileText,
  Home,
  Inbox,
  LayoutDashboard,
  LogOut,
  Menu,
  UploadCloud,
  Users,
  X,
} from "lucide-react";
import { useSession } from "@/components/auth-session";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";

const navigation = [
  { href: "/", label: "Overview", icon: Home },
  { href: "/feedback", label: "Feedback inbox", icon: Inbox },
  { href: "/insights", label: "Insights", icon: BarChart3 },
  { href: "/ask", label: "Ask LOOP", icon: Bot },
  { href: "/reports", label: "Reports", icon: FileText },
  { href: "/upload", label: "Upload CSV", icon: UploadCloud },
];

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const { token, role, ready, setToken } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  useEffect(() => {
    if (ready && !token) router.replace("/login");
  }, [ready, router, token]);
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);
  if (!ready || !token)
    return (
      <div className="grid min-h-screen place-items-center text-sm text-slate-500">
        Loading your workspace...
      </div>
    );
  const links = (
    <nav className="mt-8 space-y-1">
      {navigation.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium ${pathname === href ? "bg-blue-50 text-blue-700" : "text-slate-500 hover:bg-blue-50 hover:text-blue-700"}`}
        >
          <Icon className="size-4" />
          {label}
        </Link>
      ))}
      {role === "admin" && (
        <Link
          href="/team"
          className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium ${pathname === "/team" ? "bg-blue-50 text-blue-700" : "text-slate-500 hover:bg-blue-50 hover:text-blue-700"}`}
        >
          <Users className="size-4" />
          Team settings
        </Link>
      )}
    </nav>
  );
  const signOut = () => {
    setToken("");
    router.replace("/login");
  };
  return (
    <div className="min-h-screen bg-slate-50">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 overflow-y-auto border-r border-slate-200 bg-white p-5 lg:flex lg:flex-col">
        <Link
          href="/"
          className="flex items-center gap-3 px-2 py-2 text-xl font-bold"
        >
          <span className="grid size-9 place-items-center rounded-xl bg-blue-600 text-white">
            <LayoutDashboard className="size-5" />
          </span>
          LOOP
        </Link>
        <p className="px-2 pt-1 text-xs font-medium uppercase tracking-[.15em] text-slate-400">
          Customer intelligence
        </p>
        {links}
        <button
          onClick={signOut}
          className="mt-auto flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-rose-500 hover:bg-rose-50"
        >
          <LogOut className="size-4" />
          Sign out
        </button>
      </aside>
      {menuOpen && (
        <div
          className="fixed inset-0 z-30 bg-slate-950/30 lg:hidden"
          onClick={() => setMenuOpen(false)}
        >
          <aside
            className="h-full w-72 overflow-y-auto bg-white p-5 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <Link
                href="/"
                className="flex items-center gap-2 text-xl font-bold"
              >
                <span className="grid size-9 place-items-center rounded-xl bg-blue-600 text-white">
                  <LayoutDashboard className="size-5" />
                </span>
                LOOP
              </Link>
              <button
                aria-label="Close menu"
                onClick={() => setMenuOpen(false)}
                className="rounded-lg p-2 hover:bg-slate-100"
              >
                <X className="size-5" />
              </button>
            </div>
            {links}
            <button
              onClick={signOut}
              className="mt-8 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-rose-500 hover:bg-rose-50"
            >
              <LogOut className="size-4" />
              Sign out
            </button>
          </aside>
        </div>
      )}
      <div className="min-h-screen lg:ml-64">
        <header className="sticky top-0 z-10 flex min-h-20 items-center justify-between border-b border-slate-200 bg-white px-5 sm:px-8">
          <div className="flex items-center gap-3">
            <button
              aria-label="Open navigation"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(true)}
              className="rounded-lg p-2 hover:bg-slate-100 lg:hidden"
            >
              <Menu className="size-5" />
            </button>
            <div className="hidden lg:block">
              <p className="text-sm text-slate-500">Voice of Customer</p>
              <p className="font-semibold">Customer feedback workspace</p>
            </div>
            <div className="lg:hidden font-bold">LOOP</div>
          </div>
          <div className="relative">
            <button
              onClick={() => setAccountOpen((open) => !open)}
              aria-label="Open account menu"
              aria-expanded={accountOpen}
              aria-controls="account-menu"
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-sm font-medium"
            >
              <span className="grid size-7 place-items-center rounded-full bg-blue-600 text-xs font-bold text-white">
                L
              </span>
              <span className="hidden capitalize sm:inline">
                {role ?? "member"}
              </span>
              <ChevronDown className="size-4 text-slate-400" />
            </button>
            {accountOpen && (
              <div
                id="account-menu"
                role="menu"
                className="absolute right-0 top-11 w-44 rounded-xl border bg-white p-1 shadow-lg"
              >
                <button
                  role="menuitem"
                  onClick={signOut}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-rose-600 hover:bg-rose-50"
                >
                  <LogOut className="size-4" />
                  Sign out
                </button>
              </div>
            )}
          </div>
        </header>
        <main className="loop-workspace mx-auto w-full max-w-[1600px] p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
