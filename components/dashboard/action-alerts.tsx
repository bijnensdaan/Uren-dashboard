import Link from "next/link";
import { AlertTriangle, ArrowRight, Info, Siren } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
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

  return (
    <Card>
      <CardHeader
        title="Actiegerichte alerts"
        description="Kritieke signalen staan bovenaan en linken direct naar de juiste opvolging."
        action={
          <div className="flex gap-2">
            <Badge className="border-red-200 bg-red-50 text-red-800">{criticalCount} kritiek</Badge>
            <Badge className="border-amber-200 bg-amber-50 text-amber-800">{warningCount} warning</Badge>
          </div>
        }
      />
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
              <article key={alert.id} className={cn("rounded border p-3", severity.card)}>
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
                    <Link
                      href={alert.href}
                      className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-[var(--primary)] hover:underline"
                    >
                      {alert.actionLabel}
                      <ArrowRight size={14} />
                    </Link>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </Card>
  );
}
