import { ContractDraftReview } from "@/components/admin/contract-draft-review";
import { ContractsSection } from "@/components/admin/contracts-section";
import { EmployeesSection } from "@/components/admin/employees-section";
import { NewContractForm } from "@/components/admin/new-contract-form";
import { ProfilesSection } from "@/components/admin/profiles-section";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { loadContractDraft } from "@/lib/contract-draft-server";
import { prisma } from "@/lib/db";
import { readFeedback } from "@/lib/feedback";
import { AlertCircle, BriefcaseBusiness, Layers3, UsersRound } from "lucide-react";

// Realtime dashboard: altijd per request renderen (nooit statisch bij de build,
// zodat de build geen databaseverbinding nodig heeft en data nooit veroudert).
export const dynamic = "force-dynamic";

type AdminPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const params = (await searchParams) ?? {};
  const feedback = readFeedback(params, "admin");
  const searchQuery =
    typeof params.q === "string" ? params.q.trim().toLowerCase() : "";
  const draftId = typeof params.draft === "string" ? params.draft : "";
  const draft = draftId ? await loadContractDraft(draftId) : null;

  const [contracts, employees, profiles] = await Promise.all([
    prisma.contract.findMany({
      include: {
        tasks: {
          include: { _count: { select: { timeEntries: true } } },
          orderBy: { name: "asc" },
        },
        allocationTemplates: {
          include: { profileCategory: true },
          orderBy: { targetPercentage: "asc" },
        },
        profileRates: true,
        documents: { orderBy: { uploadedAt: "desc" } },
        _count: {
          select: {
            timeEntries: true,
            tasks: true,
            simulations: true,
            deliveryReports: true,
          },
        },
      },
      orderBy: { code: "asc" },
    }),
    prisma.employee.findMany({
      include: {
        profileCategory: true,
        _count: { select: { timeEntries: true } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.profileCategory.findMany({
      include: {
        _count: {
          select: {
            employees: true,
            timeEntries: true,
            contractAllocationTemplates: true,
          },
        },
      },
      orderBy: { name: "asc" },
    }),
  ]);

  const activeProfiles = profiles.filter((p) => p.active);
  const allocationProfiles =
    activeProfiles.length > 0 ? activeProfiles : profiles;
  const activeContracts = contracts.filter((contract) => contract.active).length;
  const activeEmployees = employees.filter((employee) => employee.active).length;
  const totalWeeklyCapacity = employees
    .filter((employee) => employee.active)
    .reduce((sum, employee) => sum + employee.weeklyCapacityHours, 0);
  const incompleteContracts = contracts.filter((contract) => {
    const allocationTotal = contract.allocationTemplates.reduce(
      (sum, line) => sum + line.targetPercentage,
      0,
    );
    return contract.tasks.length === 0 || contract.documents.length === 0 || Math.abs(allocationTotal - 100) > 0.01;
  }).length;

  return (
    <div className="grid gap-5">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-950">Beheer</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Beheer contracten, taken, profielen en medewerkers zonder
          codewijzigingen.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <a href="#opdrachtbrieven" className="rounded border border-[var(--border)] bg-white p-3 shadow-sm transition hover:border-teal-300 hover:shadow">
          <div className="flex items-start justify-between gap-3">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Opdrachtbrieven</span>
            <BriefcaseBusiness size={17} className="text-[var(--primary)]" />
          </div>
          <div className="mt-2 text-xl font-bold text-slate-950">{activeContracts} actief</div>
          <div className="mt-1 text-xs text-slate-500">{contracts.length} totaal</div>
        </a>
        <a href="#profielen" className="rounded border border-[var(--border)] bg-white p-3 shadow-sm transition hover:border-teal-300 hover:shadow">
          <div className="flex items-start justify-between gap-3">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Profielen</span>
            <Layers3 size={17} className="text-[var(--primary)]" />
          </div>
          <div className="mt-2 text-xl font-bold text-slate-950">{activeProfiles.length}</div>
          <div className="mt-1 text-xs text-slate-500">actieve profielcategorieën</div>
        </a>
        <a href="#medewerkers" className="rounded border border-[var(--border)] bg-white p-3 shadow-sm transition hover:border-teal-300 hover:shadow">
          <div className="flex items-start justify-between gap-3">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Medewerkers</span>
            <UsersRound size={17} className="text-[var(--primary)]" />
          </div>
          <div className="mt-2 text-xl font-bold text-slate-950">{activeEmployees}</div>
          <div className="mt-1 text-xs text-slate-500">{totalWeeklyCapacity.toLocaleString("nl-BE")} u/week capaciteit</div>
        </a>
        <a href="#opdrachtbrieven" className={`rounded border p-3 shadow-sm transition hover:shadow ${incompleteContracts > 0 ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}>
          <div className="flex items-start justify-between gap-3">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Configuratie</span>
            <AlertCircle size={17} className={incompleteContracts > 0 ? "text-amber-700" : "text-emerald-700"} />
          </div>
          <div className="mt-2 text-xl font-bold text-slate-950">{incompleteContracts}</div>
          <div className="mt-1 text-xs text-slate-600">opdrachtbrieven met aandachtspunt</div>
        </a>
      </div>

      <nav aria-label="Beheersecties" className="sticky top-[61px] z-20 flex gap-2 overflow-x-auto rounded border border-[var(--border)] bg-white/95 p-2 shadow-sm backdrop-blur">
        <a href="#nieuwe-opdrachtbrief" className="shrink-0 rounded px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">Nieuw</a>
        <a href="#opdrachtbrieven" className="shrink-0 rounded px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">Opdrachtbrieven <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs">{contracts.length}</span></a>
        <a href="#profielen" className="shrink-0 rounded px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">Profielen <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs">{profiles.length}</span></a>
        <a href="#medewerkers" className="shrink-0 rounded px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">Medewerkers <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs">{employees.length}</span></a>
      </nav>

      {/* Feedback banner */}
      {feedback ? (
        <FeedbackBanner type={feedback.type}>{feedback.message}</FeedbackBanner>
      ) : null}

      {/* Controle-stap van een geüploade opdrachtbrief (upload → controleren → toevoegen) */}
      {draft ? <ContractDraftReview draft={draft} /> : null}
      {draftId && !draft ? (
        <FeedbackBanner type="error">
          Het concept is niet meer beschikbaar. Upload de opdrachtbrief opnieuw.
        </FeedbackBanner>
      ) : null}

      {/* Nieuw contract — collapsed by default, visually distinct */}
      {!draft ? <div id="nieuwe-opdrachtbrief" className="scroll-mt-32"><NewContractForm allocationProfiles={allocationProfiles} /></div> : null}

      {/* Opdrachtbrieven + zijpaneel */}
      <div className="grid gap-5 xl:grid-cols-[1.3fr_0.7fr]">
        <div id="opdrachtbrieven" className="scroll-mt-32">
          <ContractsSection
            contracts={contracts}
            allocationProfiles={allocationProfiles}
            searchQuery={searchQuery}
          />
        </div>

        {/* Side panel: Profielen & Medewerkers */}
        <div className="grid gap-5">
          <div id="profielen" className="scroll-mt-32"><ProfilesSection profiles={profiles} /></div>
          <div id="medewerkers" className="scroll-mt-32"><EmployeesSection employees={employees} profiles={profiles} /></div>
        </div>
      </div>
    </div>
  );
}
