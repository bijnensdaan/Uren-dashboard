import { updateContractBilling } from "@/app/admin/actions/contracts";
import { LabeledField, SubCard, Tip } from "@/components/admin/shared";
import { Button } from "@/components/ui/button";
import { Field, inputClass } from "@/components/ui/form-fields";

type BillingContract = {
  id: string;
  vatPercentage: number;
  totalBudgetAmount: number | null;
  specificationCode: string | null;
  orderLetterTitle: string | null;
  orderLetterReference: string | null;
  domainManagerName: string | null;
  domainManagerRole: string | null;
  domainManagerOrg: string | null;
  projectLeadNames: string | null;
};

type AllocationProfile = { id: string; name: string };

/**
 * Sub-sectie "Facturatie & PV-gegevens" binnen een contract-accordion:
 * btw, budget, PV-stamdata en eenheidsprijzen per profiel.
 */
export function ContractBillingSection({
  contract,
  allocationProfiles,
  rateByProfile,
}: {
  contract: BillingContract;
  allocationProfiles: AllocationProfile[];
  rateByProfile: Map<string, number>;
}) {
  return (
    <SubCard
      title={
        <>
          Facturatie &amp; PV-gegevens
          <Tip text="PV staat voor Procès-Verbal (proces-verbaal van oplevering). Deze gegevens worden automatisch ingevuld op de PV-documenten." />
        </>
      }
      helper="Gegevens voor facturatie en het automatisch invullen van PV-documenten. Eenheidsprijzen zijn exclusief btw, per gepresteerd uur."
    >
      <form
        action={updateContractBilling}
        className="grid gap-4"
      >
        <input
          type="hidden"
          name="contractId"
          value={contract.id}
        />
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Btw %">
            <input
              name="vatPercentage"
              type="number"
              step="0.1"
              defaultValue={contract.vatPercentage}
              className={inputClass}
            />
          </Field>
          <Field label="Totaalbudget (EUR)">
            <input
              name="totalBudgetAmount"
              type="number"
              step="0.01"
              defaultValue={contract.totalBudgetAmount ?? ""}
              className={inputClass}
            />
          </Field>
          <LabeledField
            label={
              <>
                Bestekcode
                <Tip text="Het unieke referentienummer van het bestek (aanbestedingsdocument) waarop dit contract is gebaseerd." />
              </>
            }
          >
            <input
              name="specificationCode"
              defaultValue={contract.specificationCode ?? ""}
              className={inputClass}
            />
          </LabeledField>
          <Field label="Opdrachtbrief - titel">
            <input
              name="orderLetterTitle"
              defaultValue={contract.orderLetterTitle ?? ""}
              className={inputClass}
            />
          </Field>
          <Field label="Opdrachtbrief - referentie">
            <input
              name="orderLetterReference"
              defaultValue={
                contract.orderLetterReference ?? ""
              }
              className={inputClass}
            />
          </Field>
          <Field label="Domeinmanager - naam">
            <input
              name="domainManagerName"
              defaultValue={contract.domainManagerName ?? ""}
              className={inputClass}
            />
          </Field>
          <Field label="Domeinmanager - functie">
            <input
              name="domainManagerRole"
              defaultValue={contract.domainManagerRole ?? ""}
              className={inputClass}
              placeholder="Domeinmanager"
            />
          </Field>
          <Field label="Projectleider(s) - namen">
            <input
              name="projectLeadNames"
              defaultValue={contract.projectLeadNames ?? ""}
              className={inputClass}
            />
          </Field>
          <Field label="Organisatie (handtekeningblok)">
            <input
              name="domainManagerOrg"
              defaultValue={contract.domainManagerOrg ?? ""}
              className={inputClass}
              placeholder="FOD ... - DG ..."
            />
          </Field>
        </div>

        <div>
          <div className="mb-2 flex items-center text-xs font-semibold text-slate-600">
            Eenheidsprijs per profiel (excl. btw, per gepresteerd uur)
            <Tip text="Het uurtarief dat gefactureerd wordt voor dit profiel, exclusief btw." />
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {allocationProfiles.map((profile) => (
              <Field
                key={profile.id}
                label={`${profile.name} (EUR/u)`}
              >
                <input
                  type="hidden"
                  name="profileId"
                  value={profile.id}
                />
                <input
                  name={`unit-${profile.id}`}
                  type="number"
                  step="0.01"
                  defaultValue={
                    rateByProfile.get(profile.id) ?? ""
                  }
                  className={inputClass}
                />
              </Field>
            ))}
          </div>
        </div>

        <div className="flex justify-end">
          <Button type="submit" variant="secondary">
            Facturatiegegevens bewaren
          </Button>
        </div>
      </form>
    </SubCard>
  );
}
