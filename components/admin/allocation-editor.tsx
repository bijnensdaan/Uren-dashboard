"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, inputClass } from "@/components/ui/form-fields";

type Profile = {
  id: string;
  name: string;
  defaultAllocationPercentage: number;
};

type AllocationEditorProps = {
  profiles: Profile[];
  /** Map from profileId → saved percentage (from existing allocationTemplates) */
  savedAllocations: Record<string, number>;
};

export function AllocationEditor({ profiles, savedAllocations }: AllocationEditorProps) {
  const initial: Record<string, number> = {};
  for (const p of profiles) {
    initial[p.id] = savedAllocations[p.id] ?? 0;
  }
  const [values, setValues] = useState<Record<string, number>>(initial);

  const total = Object.values(values).reduce((sum, v) => sum + (Number.isFinite(v) ? v : 0), 0);
  const isValid = Math.abs(total - 100) < 0.11;

  function handleChange(id: string, raw: string) {
    const num = parseFloat(raw);
    setValues((prev) => ({ ...prev, [id]: Number.isFinite(num) ? num : 0 }));
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-3">
        {profiles.map((profile) => (
          <div key={profile.id}>
            {/* Hidden field so the server action receives profileId */}
            <input type="hidden" name="profileId" value={profile.id} />
            <Field label={`${profile.name} %`}>
              <input
                name={`allocation-${profile.id}`}
                type="number"
                step="0.1"
                value={values[profile.id] ?? 0}
                onChange={(e) => handleChange(profile.id, e.target.value)}
                className={inputClass}
              />
            </Field>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Live sum badge */}
        <span
          className={`inline-flex items-center rounded border px-3 py-1 text-sm font-semibold ${
            isValid
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-amber-200 bg-amber-50 text-amber-800"
          }`}
        >
          {isValid
            ? `= ${total.toFixed(1)}% ✓`
            : `= ${total.toFixed(1)}% (moet 100% zijn)`}
        </span>

        <Button type="submit" variant="secondary" disabled={!isValid}>
          Verdeelsleutel bewaren
        </Button>
      </div>
    </div>
  );
}
