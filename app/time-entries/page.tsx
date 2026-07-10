import { Info } from "lucide-react";
import { deleteTimeEntryFromOverview } from "@/app/time-entries/actions";
import { DeleteEntryButton } from "@/components/time-entries/delete-entry-button";
import { ImportWorkflow } from "@/components/time-entries/import-workflow";
import { ManualEntryForm } from "@/components/time-entries/manual-entry-form";
import { Card, CardHeader } from "@/components/ui/card";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { prisma } from "@/lib/db";
import { FULL_DAY_HOURS, HALF_DAY_HOURS } from "@/lib/domain/calculations";
import { readFeedback } from "@/lib/feedback";
import { formatDate, formatHours } from "@/lib/utils";

// Realtime dashboard: altijd per request renderen (nooit statisch bij de build,
// zodat de build geen databaseverbinding nodig heeft en data nooit veroudert).
export const dynamic = "force-dynamic";

const RECENT_ENTRIES = 20;

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function TimeEntriesPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const feedback = readFeedback(params, "entry");
  const previewRequired = params.import === "preview-required";

  const [contracts, employees, tasks, entries] = await Promise.all([
    prisma.contract.findMany({ orderBy: { code: "asc" } }),
    prisma.employee.findMany({ include: { profileCategory: true }, orderBy: { name: "asc" } }),
    prisma.task.findMany({ orderBy: [{ name: "asc" }] }),
    prisma.timeEntry.findMany({
      include: { contract: true, employee: true, task: true },
      orderBy: { date: "desc" },
      take: RECENT_ENTRIES,
    }),
  ]);

  const employeeOpts = employees.map((employee) => ({
    id: employee.id,
    name: employee.name,
    profileName: employee.profileCategory.name,
  }));

  const contractOpts = contracts.map((contract) => ({
    id: contract.id,
    code: contract.code,
    name: contract.name,
  }));

  const taskOpts = tasks.map((task) => ({
    id: task.id,
    name: task.name,
    contractId: task.contractId,
  }));

  const today = new Date();
  const defaultDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
    today.getDate(),
  ).padStart(2, "0")}`;

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-950">Uren</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Registreer uren handmatig of importeer registraties uit Excel/CSV.
        </p>
      </div>

      {feedback ? (
        <FeedbackBanner type={feedback.type}>{feedback.message}</FeedbackBanner>
      ) : null}
      {previewRequired ? (
        <div className="flex items-start gap-3 rounded border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
          <Info size={18} className="mt-0.5 shrink-0 text-sky-600" />
          <div>Maak eerst een preview van het bestand voordat je de import bevestigt.</div>
        </div>
      ) : null}

      <Card>
        <CardHeader
          title="Handmatige registratie"
          description="Voeg een losse urenregistratie toe; het profiel volgt automatisch de medewerker."
        />
        <ManualEntryForm
          employees={employeeOpts}
          contracts={contractOpts}
          tasks={taskOpts}
          halfDayHours={HALF_DAY_HOURS}
          fullDayHours={FULL_DAY_HOURS}
          defaultDate={defaultDate}
        />
      </Card>

      <Card>
        <CardHeader
          title="Importeren"
          description="Upload een CSV- of XLSX-bestand, controleer de kolomkoppeling en bevestig de geldige rijen."
        />
        <ImportWorkflow />
      </Card>

      <Card>
        <CardHeader
          title="Recente registraties"
          description={`De laatste ${entries.length} registraties.`}
        />
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-xs uppercase text-[var(--muted)]">
                <th className="py-2 pr-4">Datum</th>
                <th className="py-2 pr-4">Medewerker</th>
                <th className="py-2 pr-4">Uren</th>
                <th className="py-2 pr-4">Taak</th>
                <th className="py-2 pr-4">Opdrachtbrief</th>
                <th className="py-2">Actie</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} className="border-b border-slate-100">
                  <td className="py-3 pr-4">{formatDate(entry.date)}</td>
                  <td className="py-3 pr-4">{entry.employee.name}</td>
                  <td className="py-3 pr-4">{formatHours(entry.hours)}</td>
                  <td className="py-3 pr-4">{entry.task.name}</td>
                  <td className="py-3 pr-4">{entry.contract.code}</td>
                  <td className="py-3">
                    <form action={deleteTimeEntryFromOverview}>
                      <input type="hidden" name="id" value={entry.id} />
                      <input type="hidden" name="contractId" value={entry.contractId} />
                      <DeleteEntryButton
                        confirmMessage={`Registratie van ${entry.employee.name} op ${formatDate(entry.date)} (${formatHours(entry.hours)}) verwijderen?`}
                      />
                    </form>
                  </td>
                </tr>
              ))}
              {entries.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-sm text-[var(--muted)]">
                    Nog geen registraties. Voeg er hierboven een toe of importeer een bestand.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
