import { applyContractInsights, clearContractInsights } from "@/app/admin/actions/ai-setup";
import { ConfirmSubmitButton } from "@/components/admin/confirm-submit-button";
import { SubCard } from "@/components/admin/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { parseContractInsights } from "@/lib/domain/contract-insights";
import { formatDate } from "@/lib/utils";

type InsightsContract = {
  id: string;
  aiInsightsStatus: string;
  aiInsightsJson: string | null;
  aiInsightsModel: string | null;
  aiInsightsAt: Date | null;
};

/**
 * Sub-sectie "AI: opdrachtbrief uitlezen" binnen een contract-accordion:
 * toont het opgeslagen Gemini-voorstel en de knoppen om het over te nemen of te wissen.
 */
export function ContractInsightsSection({ contract }: { contract: InsightsContract }) {
  const insights =
    contract.aiInsightsStatus !== "none"
      ? parseContractInsights(contract.aiInsightsJson)
      : null;
  const allocationStatus = insights?.allocationStatus ?? "not_found";
  const allocationNote =
    insights?.allocationNote ??
    "Geen expliciete verdeelsleutel gevonden in het document. Vul de verdeelsleutel zelf in.";
  return (
    <SubCard
      title="AI: opdrachtbrief uitlezen"
      helper="Controleer het voorstel dat Gemini uit de opdrachtbrief heeft gehaald en neem het daarna over."
    >
      {/* Toon het opgeslagen AI-voorstel */}
      {insights ? (
        <div className="grid gap-4 rounded border border-slate-200 bg-white p-4">
          {/* Status + meta */}
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              className={
                contract.aiInsightsStatus === "applied"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-amber-200 bg-amber-50 text-amber-800"
              }
            >
              {contract.aiInsightsStatus === "applied"
                ? "Toegepast"
                : "Concept"}
            </Badge>
            <span className="text-xs text-[var(--muted)]">
              Model: {contract.aiInsightsModel ?? "—"} ·{" "}
              {contract.aiInsightsAt
                ? formatDate(contract.aiInsightsAt)
                : "—"}
            </span>
            {contract.aiInsightsStatus === "applied" ? (
              <span className="text-xs text-emerald-700">
                — Gegevens zijn overgenomen in het contract.
              </span>
            ) : null}
          </div>

          {/* overallRationale */}
          {insights.overallRationale ? (
            <p className="text-xs text-[var(--muted)]">
              {insights.overallRationale}
            </p>
          ) : null}

          {/* Verdeelsleutel */}
          <div>
            <div className="mb-1 flex flex-wrap items-center gap-2 text-xs font-semibold uppercase text-slate-600">
              <span>Verdeelsleutel</span>
              <Badge
                className={
                  allocationStatus === "complete"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : allocationStatus === "inferred"
                      ? "border-blue-200 bg-blue-50 text-blue-800"
                    : allocationStatus === "partial"
                      ? "border-amber-200 bg-amber-50 text-amber-800"
                      : "border-slate-200 bg-slate-50 text-slate-700"
                }
              >
                {allocationStatus === "complete"
                  ? "Expliciet gevonden"
                  : allocationStatus === "inferred"
                    ? "AI-voorstel"
                  : allocationStatus === "partial"
                    ? "Onvolledig"
                    : "Niet gevonden"}
              </Badge>
            </div>
            <p className="mb-2 text-xs text-[var(--muted)]">{allocationNote}</p>
            {insights.allocation.length === 0 ? (
              <p className="rounded border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700">
                Er wordt geen verdeelsleutel overgenomen. Vul deze zelf in bij de contractverdeling.
              </p>
            ) : (
              <div className="grid gap-1">
              {insights.allocation.map((line) => (
                <div
                  key={line.profileCategoryId}
                  className="flex flex-wrap items-center gap-2 text-sm"
                >
                  <span className="font-medium text-slate-800">
                    {line.profileName}
                  </span>
                  <span className="text-slate-500">—</span>
                  <span>{line.suggestedPercentage}%</span>
                  <span className="text-slate-400">·</span>
                  <span className="text-xs text-[var(--muted)]">
                    {line.unitPrice !== null
                      ? `€${line.unitPrice}/u`
                      : "geen tarief"}
                  </span>
                </div>
              ))}
              </div>
            )}
          </div>

          {/* Profielen, werknemers en taken */}
          <div>
            <div className="mb-1 text-xs font-semibold uppercase text-slate-600">
              Profielen, werknemers en taken
            </div>
            {(insights.suggestedProfiles?.length ?? 0) === 0 &&
            (insights.suggestedEmployees?.length ?? 0) === 0 &&
            (insights.suggestedTasks?.length ?? 0) === 0 ? (
              <p className="rounded border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700">
                Gemini vond of stelde geen extra profielen, werknemers of taken voor.
              </p>
            ) : (
              <div className="grid gap-3 md:grid-cols-3">
                <div className="grid gap-1">
                  <div className="text-xs font-medium text-slate-700">Profielen</div>
                  {(insights.suggestedProfiles ?? []).map((profile) => (
                    <div
                      key={`${profile.name}-${profile.source}`}
                      className="flex flex-wrap items-center gap-2 text-sm"
                    >
                      <span className="font-medium text-slate-800">{profile.name}</span>
                      <Badge
                        className={
                          profile.source === "explicit"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                            : "border-blue-200 bg-blue-50 text-blue-800"
                        }
                      >
                        {profile.source === "explicit" ? "Uit document" : "AI-voorstel"}
                      </Badge>
                      {profile.defaultAllocationPercentage !== null ? (
                        <span className="text-xs text-[var(--muted)]">
                          {profile.defaultAllocationPercentage}%
                        </span>
                      ) : null}
                    </div>
                  ))}
                </div>
                <div className="grid gap-1">
                  <div className="text-xs font-medium text-slate-700">Werknemers</div>
                  {(insights.suggestedEmployees ?? []).map((employee) => (
                    <div
                      key={`${employee.name}-${employee.profileName}`}
                      className="flex flex-wrap items-center gap-2 text-sm"
                    >
                      <span className="font-medium text-slate-800">{employee.name}</span>
                      <span className="text-xs text-[var(--muted)]">{employee.profileName}</span>
                      <Badge
                        className={
                          employee.source === "explicit"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                            : "border-blue-200 bg-blue-50 text-blue-800"
                        }
                      >
                        {employee.source === "explicit" ? "Uit document" : "AI-voorstel"}
                      </Badge>
                      {employee.weeklyCapacityHours !== null ? (
                        <span className="text-xs text-[var(--muted)]">
                          {employee.weeklyCapacityHours} u/week
                        </span>
                      ) : null}
                    </div>
                  ))}
                </div>
                <div className="grid gap-1">
                  <div className="text-xs font-medium text-slate-700">Taken</div>
                  {(insights.suggestedTasks ?? []).map((task) => (
                    <div
                      key={`${task.name}-${task.source}`}
                      className="flex flex-wrap items-center gap-2 text-sm"
                    >
                      <span className="font-medium text-slate-800">{task.name}</span>
                      <Badge
                        className={
                          task.source === "explicit"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                            : "border-blue-200 bg-blue-50 text-blue-800"
                        }
                      >
                        {task.source === "explicit" ? "Uit document" : "AI-voorstel"}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Totaal uren */}
          <div className="text-sm">
            <span className="text-xs font-semibold uppercase text-slate-600">
              Totaal voorziene uren:{" "}
            </span>
            <span className="font-medium text-slate-800">
              {insights.suggestedTotalHours ?? "—"}
            </span>
          </div>

          {/* PV-stamdata */}
          <div>
            <div className="mb-1 text-xs font-semibold uppercase text-slate-600">
              PV-stamdata
            </div>
            <div className="grid gap-0.5 text-sm">
              <div>
                <span className="text-xs text-[var(--muted)]">Titel: </span>
                <span className="text-slate-800">
                  {insights.pv.orderLetterTitle ?? "—"}
                </span>
              </div>
              <div>
                <span className="text-xs text-[var(--muted)]">Referentie: </span>
                <span className="text-slate-800">
                  {insights.pv.orderLetterReference ?? "—"}
                </span>
              </div>
              <div>
                <span className="text-xs text-[var(--muted)]">Bestekcode: </span>
                <span className="text-slate-800">
                  {insights.pv.specificationCode ?? "—"}
                </span>
              </div>
              <div>
                <span className="text-xs text-[var(--muted)]">Domeinmanager: </span>
                <span className="text-slate-800">
                  {insights.pv.domainManagerName ?? "—"}
                </span>
              </div>
              <div>
                <span className="text-xs text-[var(--muted)]">Projectleider(s): </span>
                <span className="text-slate-800">
                  {insights.pv.projectLeadNames ?? "—"}
                </span>
              </div>
            </div>
          </div>

          {/* Fasering */}
          <div>
            <div className="mb-1 text-xs font-semibold uppercase text-slate-600">
              Fasering{" "}
              <span className="font-normal normal-case text-[var(--muted)]">
                ({insights.phases.length} fases)
              </span>
            </div>
            {insights.phases.length === 0 ? (
              <p className="text-xs text-[var(--muted)]">
                Geen fasering gevonden.
              </p>
            ) : (
              <div className="grid gap-1">
                {insights.phases.map((phase, idx) => (
                  <div
                    key={idx}
                    className="flex flex-wrap items-center gap-2 text-sm"
                  >
                    <span className="font-medium text-slate-800">
                      {phase.name}
                    </span>
                    <span className="text-xs text-[var(--muted)]">
                      ({phase.startDate ?? "?"} – {phase.endDate ?? "?"})
                    </span>
                    <span className="text-slate-400">—</span>
                    <span className="text-xs">{phase.weightPercentage}%</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Actieknoppen */}
          <div className="flex flex-wrap items-start gap-3 border-t border-slate-100 pt-3">
            <div className="flex-1">
              <form action={applyContractInsights}>
                <input
                  type="hidden"
                  name="contractId"
                  value={contract.id}
                />
                <Button type="submit">
                  Overnemen in contract
                </Button>
              </form>
              <p className="mt-1 text-xs text-[var(--muted)]">
                Neemt de AI-inzichten over: profielen en werknemers worden aangemaakt of heractiveerd, en een complete verdeelsleutel wordt opgeslagen. AI-voorstellen blijven herkenbaar in dit voorstel.
              </p>
            </div>
            <form action={clearContractInsights}>
              <input
                type="hidden"
                name="contractId"
                value={contract.id}
              />
              <ConfirmSubmitButton
                confirmMessage="AI-inzichten wissen voor deze opdrachtbrief? De huidige uitlezing wordt verwijderd. U kunt daarna opnieuw uitlezen."
                label="Opnieuw uitlezen / wissen"
                variant="danger"
              />
            </form>
          </div>
        </div>
      ) : null}
    </SubCard>
  );
}
