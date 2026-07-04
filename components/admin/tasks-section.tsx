import { createTask, deactivateTask, updateTask } from "@/app/admin/actions/tasks";
import { ConfirmSubmitButton } from "@/components/admin/confirm-submit-button";
import { SubCard } from "@/components/admin/shared";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/ui/form-fields";

type ContractTask = {
  id: string;
  name: string;
  active: boolean;
  _count: { timeEntries: number };
};

/**
 * Sub-sectie "Taken binnen deze opdrachtbrief" binnen een contract-accordion:
 * taken hernoemen, (de)activeren en toevoegen.
 */
export function TasksSection({
  contractId,
  tasks,
}: {
  contractId: string;
  tasks: ContractTask[];
}) {
  return (
    <SubCard
      title="Taken binnen deze opdrachtbrief"
      helper="Taken zijn de werkonderdelen waarop medewerkers hun uren boeken. U kunt taken hernoemen, (de)activeren of nieuwe taken toevoegen."
    >
      <div className="grid gap-2">
        {tasks.map((task) => (
          <div
            key={task.id}
            className="flex flex-wrap items-center gap-2 rounded border border-slate-100 bg-white p-2"
          >
            <form
              action={updateTask}
              className="flex flex-1 flex-wrap items-center gap-2"
            >
              <input type="hidden" name="id" value={task.id} />
              <input
                type="hidden"
                name="contractId"
                value={contractId}
              />
              <input
                name="name"
                defaultValue={task.name}
                className={`${inputClass} flex-1`}
              />
              <label className="flex items-center gap-1.5 text-sm text-slate-700">
                <input
                  name="active"
                  type="checkbox"
                  defaultChecked={task.active}
                />
                Actief
              </label>
              <Button type="submit" variant="secondary">
                Bewaren
              </Button>
            </form>
            <span className="text-xs text-[var(--muted)]">
              {task._count.timeEntries} geregistreerde uren-lijnen
            </span>
            <form action={deactivateTask}>
              <input type="hidden" name="id" value={task.id} />
              <ConfirmSubmitButton
                confirmMessage={`Taak "${task.name}" deactiveren? Medewerkers kunnen er geen uren meer op boeken. Historische uren blijven bewaard.`}
                label="Deactiveer taak"
                variant="danger"
              />
            </form>
          </div>
        ))}
        <form
          action={createTask}
          className="flex flex-wrap gap-2"
        >
          <input
            type="hidden"
            name="contractId"
            value={contractId}
          />
          <input
            name="name"
            className={`${inputClass} flex-1`}
            placeholder="Naam nieuwe taak"
          />
          <Button type="submit">Taak toevoegen</Button>
        </form>
      </div>
    </SubCard>
  );
}
