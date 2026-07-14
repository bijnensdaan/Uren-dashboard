"use client";

import { useMemo, useState } from "react";
import { PlusCircle } from "lucide-react";
import { createManualTimeEntry } from "@/app/time-entries/actions";
import { Button } from "@/components/ui/button";
import { Field, inputClass } from "@/components/ui/form-fields";
import { PendingNotice, SubmitButton } from "@/components/ui/pending-feedback";

type EmployeeOption = {
  id: string;
  name: string;
  profileName: string;
};

type ContractOption = {
  id: string;
  code: string;
  name: string;
  hoursPerDay: number;
};

type TaskOption = {
  id: string;
  name: string;
  contractId: string;
};

type ManualEntryFormProps = {
  employees: EmployeeOption[];
  contracts: ContractOption[];
  tasks: TaskOption[];
  /** Standaarddatum (vandaag) in yyyy-mm-dd, meegegeven door de server. */
  defaultDate: string;
};

/**
 * Eenvoudig formulier voor handmatige urenregistratie. De taken worden
 * gefilterd op de gekozen opdrachtbrief en het profiel volgt automatisch de
 * gekozen medewerker (dat regelt de server action).
 */
export function ManualEntryForm({
  employees,
  contracts,
  tasks,
  defaultDate,
}: ManualEntryFormProps) {
  const [employeeId, setEmployeeId] = useState("");
  const [contractId, setContractId] = useState("");
  const [hours, setHours] = useState("");

  const contractTasks = useMemo(
    () => tasks.filter((task) => task.contractId === contractId),
    [tasks, contractId],
  );

  const selectedEmployee = employees.find((employee) => employee.id === employeeId);
  const selectedContract = contracts.find((contract) => contract.id === contractId);
  const fullDayHours = selectedContract?.hoursPerDay ?? 8;
  const halfDayHours = fullDayHours / 2;

  return (
    <form action={createManualTimeEntry} className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        <Field label="Medewerker">
          <select
            name="employeeId"
            value={employeeId}
            onChange={(event) => setEmployeeId(event.target.value)}
            className={inputClass}
            required
          >
            <option value="">Kies een medewerker</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.name} ({employee.profileName})
              </option>
            ))}
          </select>
        </Field>

        <Field label="Datum">
          <input name="date" type="date" defaultValue={defaultDate} className={inputClass} required />
        </Field>

        <Field label="Uren">
          <div className="flex gap-2">
            <input
              name="hours"
              type="number"
              step="0.5"
              min="0.5"
              max="24"
              value={hours}
              onChange={(event) => setHours(event.target.value)}
              className={`${inputClass} w-24`}
              placeholder="0"
              required
            />
            <Button
              type="button"
              variant="secondary"
              className="h-10 whitespace-nowrap px-3"
              onClick={() => setHours(String(halfDayHours))}
              disabled={!selectedContract}
            >
              Halve dag ({halfDayHours}u)
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="h-10 whitespace-nowrap px-3"
              onClick={() => setHours(String(fullDayHours))}
              disabled={!selectedContract}
            >
              Volledige dag ({fullDayHours}u)
            </Button>
          </div>
        </Field>

        <Field label="Opdrachtbrief">
          <select
            name="contractId"
            value={contractId}
            onChange={(event) => setContractId(event.target.value)}
            className={inputClass}
            required
          >
            <option value="">Kies een opdrachtbrief</option>
            {contracts.map((contract) => (
              <option key={contract.id} value={contract.id}>
                {contract.code} — {contract.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Taak">
          <select name="taskId" className={inputClass} required disabled={!contractId}>
            <option value="">
              {contractId ? "Kies een taak" : "Kies eerst een opdrachtbrief"}
            </option>
            {contractTasks.map((task) => (
              <option key={task.id} value={task.id}>
                {task.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Notities (optioneel)">
          <input name="notes" type="text" className={inputClass} placeholder="Korte toelichting" />
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pendingLabel="Registreren...">
          <PlusCircle size={16} />
          Registratie toevoegen
        </SubmitButton>
        {selectedEmployee ? (
          <span className="text-xs text-[var(--muted)]">
            Profiel wordt automatisch: {selectedEmployee.profileName}
          </span>
        ) : null}
        <PendingNotice text="Registratie wordt opgeslagen..." />
      </div>
    </form>
  );
}
