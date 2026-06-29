import type { Metadata } from "next";
import Link from "next/link";
import { BarChart3, CalendarRange, Clock, FileText, FlaskConical, Settings } from "lucide-react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Uren Dashboard",
  description: "Intern contractbudget- en urenregistratieplatform",
};

const navItems = [
  { href: "/", label: "Dashboard", icon: BarChart3 },
  { href: "/time-entries", label: "Uren", icon: Clock },
  { href: "/simulations", label: "Simulatie", icon: FlaskConical },
  { href: "/planning", label: "Planning", icon: CalendarRange },
  { href: "/admin", label: "Beheer", icon: Settings },
  { href: "/reports", label: "PV", icon: FileText },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl">
      <body suppressHydrationWarning>
        <div className="min-h-screen">
          <header className="no-print sticky top-0 z-30 border-b border-[var(--border)] bg-white/95 backdrop-blur">
            <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3">
              <Link href="/" className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded bg-[var(--primary)] text-white">
                  <BarChart3 size={19} />
                </div>
                <div>
                  <div className="text-sm font-bold">Uren Dashboard</div>
                  <div className="text-xs text-[var(--muted)]">Operations cockpit</div>
                </div>
              </Link>
              <nav className="flex items-center gap-1">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="flex items-center gap-2 rounded px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                    >
                      <Icon size={16} />
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
            </div>
          </header>
          <main className="mx-auto max-w-7xl px-5 py-6">{children}</main>
        </div>
      </body>
    </html>
  );
}
