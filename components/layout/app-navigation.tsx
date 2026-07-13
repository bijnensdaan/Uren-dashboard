"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, CalendarRange, Clock, FileText, FlaskConical, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Dashboard", icon: BarChart3 },
  { href: "/time-entries", label: "Uren", icon: Clock },
  { href: "/simulations", label: "Simulatie", icon: FlaskConical },
  { href: "/planning", label: "Planning", icon: CalendarRange },
  { href: "/admin", label: "Beheer", icon: Settings },
  { href: "/reports", label: "PV", icon: FileText },
];

export function AppNavigation() {
  const pathname = usePathname();

  return (
    <nav aria-label="Hoofdnavigatie" className="flex min-w-0 items-center gap-1 overflow-x-auto">
      {navItems.map((item) => {
        const Icon = item.icon;
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded px-3 py-2 text-sm font-medium transition",
              active
                ? "bg-teal-50 text-[var(--primary-strong)]"
                : "text-slate-700 hover:bg-slate-100",
            )}
          >
            <Icon size={16} />
            <span className="hidden sm:inline">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
