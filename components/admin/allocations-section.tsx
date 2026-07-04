import { updateContractAllocations } from "@/app/admin/actions/allocations";
import { AllocationEditor } from "@/components/admin/allocation-editor";
import { SubCard, Tip } from "@/components/admin/shared";

type AllocationProfile = {
  id: string;
  name: string;
  defaultAllocationPercentage: number;
};

/**
 * Sub-sectie "Verdeelsleutel" binnen een contract-accordion:
 * percentages per profiel bewerken via de client-side AllocationEditor.
 */
export function AllocationsSection({
  contractId,
  allocationProfiles,
  savedAllocations,
}: {
  contractId: string;
  allocationProfiles: AllocationProfile[];
  savedAllocations: Record<string, number>;
}) {
  return (
    <SubCard
      title={
        <>
          Verdeelsleutel
          <Tip text="De verdeelsleutel bepaalt hoe de uren worden verdeeld over de verschillende profielen (bijv. Analist, Ontwikkelaar). Het totaal moet altijd exact 100% zijn." />
        </>
      }
      helper="Hoe de uren over de profielen verdeeld worden — samen exact 100%. De groene indicator bevestigt dat het totaal klopt voor u opslaat."
    >
      <form action={updateContractAllocations}>
        <input
          type="hidden"
          name="contractId"
          value={contractId}
        />
        <AllocationEditor
          profiles={allocationProfiles.map((p) => ({
            id: p.id,
            name: p.name,
            defaultAllocationPercentage:
              p.defaultAllocationPercentage,
          }))}
          savedAllocations={savedAllocations}
        />
      </form>
    </SubCard>
  );
}
