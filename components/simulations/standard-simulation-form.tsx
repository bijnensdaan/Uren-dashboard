"use client";

import { useMemo, useState } from "react";
import { FlaskConical } from "lucide-react";
import { Field, inputClass } from "@/components/ui/form-fields";
import { PendingNotice, SubmitButton } from "@/components/ui/pending-feedback";

type StandardSimulationContract = {
  id: string;
  code: string;
  name: string;
  totalBudgetHours: number;
  aiInsightsStatus: string;
};

type StandardSimulationFormProps = {
  contracts: StandardSimulationContract[];
  action: (formData: FormData) => void | Promise<void>;
};

export function StandardSimulationForm({ contracts, action }: StandardSimulationFormProps) {
  const [contractId, setContractId] = useState(contracts[0]?.id ?? "");
  const selected = useMemo(
    () => contracts.find((contract) => contract.id === contractId) ?? contracts[0],
    [contracts, contractId],
  );

  return (
    <form action={action} className="grid gap-3">
      <Field label="Opdrachtbrief">
        <select
          name="contractId"
          className={inputClass}
          value={contractId}
          onChange={(event) => setContractId(event.target.value)}
          required
        >
          {contracts.map((contract) => (
            <option key={contract.id} value={contract.id}>
              {contract.code} - {contract.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Totaal voorziene uren">
        <input
          key={selected?.id ?? "empty"}
          name="inputTotalHours"
          type="number"
          step="0.1"
          className={inputClass}
          defaultValue={selected?.totalBudgetHours ?? 380}
          required
        />
        {selected?.aiInsightsStatus === "applied" ? (
          <span className="text-xs font-normal text-teal-700">Voorgevuld vanuit Beheer.</span>
        ) : null}
      </Field>
      <SubmitButton type="submit" pendingLabel="Voorstel maken...">
        <FlaskConical size={16} />
        Standaardvoorstel maken
      </SubmitButton>
      <PendingNotice text="Standaardsimulatie wordt gemaakt..." />
    </form>
  );
}
