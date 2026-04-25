"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  CreditCard,
  Smartphone,
  Banknote,
  ShieldAlert,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Bell,
  Menu,
  X,
  Loader2,
} from "lucide-react";
import { useAuth, useRequireAuth } from "@/context/AuthContext";
import { recentDecisions } from "@/lib/api";

const NAV_ITEMS = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    exact: true,
  },
  { href: "/dashboard/card-payment", label: "Card Payment", icon: CreditCard },
  { href: "/dashboard/online-payment", label: "Online Payment", icon: Smartphone },
  { href: "/dashboard/atm", label: "ATM Withdrawal", icon: Banknote },
  { href: "/dashboard/confirm", label: "Security Alerts", icon: ShieldAlert },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading } = useRequireAuth();
  const { logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [bellOpen, setBellOpen] = useState(false);
  const knownCount = useRef(0);

  const pollNotifications = useCallback(async () => {
    try {
      const data = await recentDecisions();
      const newCount = data.length - knownCount.current;
      if (knownCount.current > 0 && newCount > 0) {
        setUnreadCount((n) => n + newCount);
      }
      knownCount.current = data.length;
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    pollNotifications();
    const t = setInterval(pollNotifications, 3000);
    return () => clearInterval(t);
  }, [pollNotifications]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="size-6 animate-spin text-[var(--brand)]" />
      </div>
    );
  }

  if (!user) return null;

  function handleLogout() {
    logout();
    router.replace("/login");
  }

  const sidebarContent = (
    <div className="flex flex-col h-full">
      <div
        className={`flex items-center gap-3 px-4 py-5 border-b border-[var(--border)] ${
          collapsed ? "justify-center" : ""
        }`}
      >
        <div className="size-9 rounded-xl brand-gradient grid place-items-center text-white font-bold shrink-0">
          S
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <div className="font-semibold text-sm leading-tight truncate">SafeBank PK</div>
            <div className="text-[11px] text-[var(--foreground)]/55">Anomaly Detector</div>
          </div>
        )}
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? "brand-gradient text-white"
                  : "hover:bg-[var(--surface-muted)] text-[var(--foreground)]/75 hover:text-[var(--foreground)]"
              } ${collapsed ? "justify-center" : ""}`}
            >
              <Icon className="size-5 shrink-0" />
              {!collapsed && <span className="truncate">{label}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="px-3 py-4 border-t border-[var(--border)] space-y-2">
        {!collapsed && (
          <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-[var(--surface-muted)]">
            <div className="size-8 rounded-lg brand-gradient grid place-items-center text-white text-xs font-bold shrink-0">
              {user.avatar}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold truncate">{user.name}</div>
              <div className="text-[11px] text-[var(--foreground)]/55 capitalize">
                {user.role}
              </div>
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={handleLogout}
          className={`w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-red-600 hover:bg-red-500/10 transition-colors ${
            collapsed ? "justify-center" : ""
          }`}
        >
          <LogOut className="size-4 shrink-0" />
          {!collapsed && "Sign out"}
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--background)]">
      {/* Desktop sidebar */}
      <motion.aside
        animate={{ width: collapsed ? 72 : 240 }}
        transition={{ duration: 0.22, ease: "easeInOut" }}
        className="hidden lg:flex flex-col glass border-r border-[var(--border)] overflow-hidden shrink-0"
      >
        {sidebarContent}
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="absolute left-[230px] lg:flex hidden top-14 z-50 size-6 rounded-full brand-gradient text-white shadow-md items-center justify-center"
          style={{ left: collapsed ? 58 : 228 }}
        >
          {collapsed ? (
            <ChevronRight className="size-3" />
          ) : (
            <ChevronLeft className="size-3" />
          )}
        </button>
      </motion.aside>

      {/* Mobile sidebar overlay */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
              className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
            />
            <motion.aside
              initial={{ x: -260 }}
              animate={{ x: 0 }}
              exit={{ x: -260 }}
              transition={{ type: "spring", stiffness: 320, damping: 28 }}
              className="fixed inset-y-0 left-0 z-50 w-64 glass border-r border-[var(--border)] lg:hidden"
            >
              {sidebarContent}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main area */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Topbar */}
        <header className="flex items-center justify-between gap-4 px-6 py-3.5 glass border-b border-[var(--border)] shrink-0">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="lg:hidden size-8 grid place-items-center rounded-lg hover:bg-[var(--surface-muted)]"
              onClick={() => setMobileOpen((v) => !v)}
            >
              {mobileOpen ? <X className="size-4" /> : <Menu className="size-4" />}
            </button>
            <PageTitle pathname={pathname} />
          </div>
          <div className="flex items-center gap-3">
            {/* Live transaction bell */}
            <div className="relative">
              <button
                type="button"
                onClick={() => { setBellOpen((v) => !v); setUnreadCount(0); }}
                className="size-9 rounded-xl hover:bg-[var(--surface-muted)] grid place-items-center relative"
              >
                <Bell className="size-4" />
                {unreadCount > 0 && (
                  <motion.span
                    key={unreadCount}
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 rounded-full bg-red-500 text-white text-[9px] font-bold grid place-items-center px-0.5"
                  >
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </motion.span>
                )}
              </button>
              <AnimatePresence>
                {bellOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 6, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 4, scale: 0.97 }}
                    className="absolute right-0 top-11 w-64 glass card-shadow rounded-2xl border border-[var(--border)] p-3 z-50 text-xs"
                  >
                    <p className="font-semibold mb-1">Live monitoring</p>
                    <p className="text-[var(--foreground)]/60 leading-relaxed">
                      Transactions are scored in real-time and reflected here every 3 seconds.
                      Go to <Link href="/dashboard" onClick={() => setBellOpen(false)} className="text-[var(--brand)] underline">Overview</Link> for the full live feed.
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Live pulse indicator */}
            <div className="hidden sm:flex items-center gap-1.5 text-[10px] text-emerald-600 font-medium">
              <span className="relative flex size-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75" />
                <span className="relative inline-flex rounded-full size-2 bg-emerald-500" />
              </span>
              Live
            </div>

            <div className="size-9 rounded-xl brand-gradient grid place-items-center text-white text-sm font-bold">
              {user.avatar}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto px-6 py-6 scrollbar-thin">
          {children}
        </main>

        <footer className="px-6 py-2 text-[10px] text-[var(--foreground)]/40 border-t border-[var(--border)] shrink-0">
          SafeBank PK · SBP-aligned AML/CFT monitoring · InfiniteAI Hackathon 2026
        </footer>
      </div>
    </div>
  );
}

function PageTitle({ pathname }: { pathname: string }) {
  const map: Record<string, string> = {
    "/dashboard": "Overview",
    "/dashboard/card-payment": "Card Payment",
    "/dashboard/online-payment": "Online Payment",
    "/dashboard/atm": "ATM Withdrawal",
    "/dashboard/confirm": "Security Alerts",
  };
  const title = map[pathname] ?? "SafeBank PK";
  return <h1 className="text-sm font-semibold truncate">{title}</h1>;
}
