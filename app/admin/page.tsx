import { ContractDraftReview } from "@/components/admin/contract-draft-review";
import { ContractsSection } from "@/components/admin/contracts-section";
import { EmployeesSection } from "@/components/admin/employees-section";
import { NewContractForm } from "@/components/admin/new-contract-form";
import { ProfilesSection } from "@/components/admin/profiles-section";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { loadContractDraft } from "@/lib/contract-draft-server";
import { prisma } from "@/lib/db";
import { readFeedback } from "@/lib/feedback";

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
      {!draft ? <NewContractForm allocationProfiles={allocationProfiles} /> : null}

      {/* Opdrachtbrieven + zijpaneel */}
      <div className="grid gap-5 xl:grid-cols-[1.3fr_0.7fr]">
        <ContractsSection
          contracts={contracts}
          allocationProfiles={allocationProfiles}
          searchQuery={searchQuery}
        />

        {/* Side panel: Profielen & Medewerkers */}
        <div className="grid gap-5">
          <ProfilesSection profiles={profiles} />
          <EmployeesSection employees={employees} profiles={profiles} />
        </div>
      </div>
    </div>
  );
}
