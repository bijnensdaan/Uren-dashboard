import type { Metadata } from "next";
import Link from "next/link";
import { BarChart3 } from "lucide-react";
import { AppNavigation } from "@/components/layout/app-navigation";
import "./globals.css";

export const metadata: Metadata = {
  title: "Uren Dashboard",
  description: "Intern contractbudget- en urenregistratieplatform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl">
      <body suppressHydrationWarning>
        <div className="min-h-screen">
          <header className="no-print sticky top-0 z-30 border-b border-[var(--border)] bg-white/95 backdrop-blur">
            <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-5">
              <Link href="/" className="flex shrink-0 items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded bg-[var(--primary)] text-white">
                  <BarChart3 size={19} />
                </div>
                <div className="hidden md:block">
                  <div className="text-sm font-bold">Uren Dashboard</div>
                  <div className="text-xs text-[var(--muted)]">Operations cockpit</div>
                </div>
              </Link>
              <AppNavigation />
            </div>
          </header>
          <main className="mx-auto max-w-7xl px-4 py-5 sm:px-5 sm:py-6">{children}</main>
        </div>
      </body>
    </html>
  );
}
