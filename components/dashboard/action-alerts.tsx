import Link from "next/link";
import { AlertTriangle, ArrowRight, ChevronDown, Info, Siren } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { DashboardAlert, DashboardAlertSeverity } from "@/lib/domain/dashboard-alerts";
import { cn } from "@/lib/utils";

function severityClasses(severity: DashboardAlertSeverity) {
  return {
    critical: {
      card: "border-red-200 bg-red-50",
      icon: "text-red-700",
      badge: "border-red-200 bg-red-100 text-red-900",
      label: "Kritiek",
      Icon: Siren,
    },
    warning: {
      card: "border-amber-200 bg-amber-50",
      icon: "text-amber-700",
      badge: "border-amber-200 bg-amber-100 text-amber-900",
      label: "Warning",
      Icon: AlertTriangle,
    },
    info: {
      card: "border-sky-200 bg-sky-50",
      icon: "text-sky-700",
      badge: "border-sky-200 bg-sky-100 text-sky-900",
      label: "Signaal",
      Icon: Info,
    },
  }[severity];
}

function categoryLabel(category: DashboardAlert["category"]) {
  return {
    budget: "Budget",
    profile: "Profielmix",
    stale: "Actualiteit",
    task: "Taakverdeling",
  }[category];
}

export function ActionAlerts({ alerts }: { alerts: DashboardAlert[] }) {
  const criticalCount = alerts.filter((alert) => alert.severity === "critical").length;
  const warningCount = alerts.filter((alert) => alert.severity === "warning").length;
  const infoCount = alerts.filter((alert) => alert.severity === "info").length;

  return (
    <details className="group rounded border border-[var(--border)] bg-white shadow-sm">
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 px-4 py-3 marker:hidden">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-slate-200 bg-slate-50 text-[var(--primary)]">
            <AlertTriangle size={17} />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-slate-950">Meldingen</h2>
            <p className="mt-0.5 text-xs text-[var(--muted)]">
              {alerts.length === 0
                ? "Geen actiepunten binnen de huidige selectie."
                : `${alerts.length} signaal${alerts.length === 1 ? "" : "en"} binnen de huidige selectie.`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {criticalCount > 0 ? (
            <Badge className="border-red-200 bg-red-50 text-red-800">{criticalCount} kritiek</Badge>
          ) : null}
          {warningCount > 0 ? (
            <Badge className="border-amber-200 bg-amber-50 text-amber-800">{warningCount} warning</Badge>
          ) : null}
          {infoCount > 0 ? (
            <Badge className="border-sky-200 bg-sky-50 text-sky-800">{infoCount} signaal</Badge>
          ) : null}
          <ChevronDown size={18} className="text-slate-500 transition group-open:rotate-180" />
        </div>
      </summary>

      <div className="border-t border-slate-100 px-4 pb-4 pt-3">
        {alerts.length === 0 ? (
          <div className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
            Geen actiepunten binnen de huidige selectie.
          </div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {alerts.map((alert) => {
              const severity = severityClasses(alert.severity);
              const Icon = severity.Icon;
              return (
                <Link
                  key={alert.id}
                  href={alert.href}
                  className={cn("block rounded border p-3 transition hover:shadow-sm", severity.card)}
                >
                  <div className="flex items-start gap-3">
                    <Icon className={cn("mt-0.5 shrink-0", severity.icon)} size={18} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className={severity.badge}>{severity.label}</Badge>
                        <Badge className="border-white/80 bg-white/70 text-slate-700">
                          {categoryLabel(alert.category)}
                        </Badge>
                      </div>
                      <h3 className="mt-2 text-sm font-bold text-slate-950">{alert.title}</h3>
                      <p className="mt-1 text-sm leading-5 text-slate-700">{alert.reason}</p>
                      <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-[var(--primary)]">
                        {alert.actionLabel}
                        <ArrowRight size={14} />
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </details>
  );
}
