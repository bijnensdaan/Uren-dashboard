"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, FileSpreadsheet, RefreshCw, Upload, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, inputClass } from "@/components/ui/form-fields";
import { Skeleton, SkeletonLines } from "@/components/ui/skeleton";
import type {
  ColumnMapping,
  ImportField,
  ImportValidationResult,
  RawImportRow,
} from "@/lib/domain/import";

const fields: Array<{ value: ImportField; label: string; required: boolean }> = [
  { value: "employee", label: "Medewerker", required: true },
  { value: "date", label: "Datum", required: true },
  { value: "hours", label: "Uren", required: true },
  { value: "task", label: "Taak", required: true },
  { value: "contract", label: "Opdrachtbrief", required: true },
  { value: "profile", label: "Profiel", required: true },
  { value: "notes", label: "Notities", required: false },
];

type PreviewResponse = {
  fileName: string;
  columns: string[];
  rows: RawImportRow[];
  mapping: ColumnMapping;
  validation: ImportValidationResult;
};

type ConfirmResponse = {
  imported: number;
  skipped: number;
  validation: ImportValidationResult;
};

export function ImportWorkflow() {
  const router = useRouter();
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [validation, setValidation] = useState<ImportValidationResult | null>(null);
  const [message, setMessage] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);

  const visibleRows = useMemo(() => validation?.rows.slice(0, 80) ?? [], [validation]);

  async function handlePreview(formData: FormData) {
    setIsLoading(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/import/preview", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Preview maken is mislukt.");
      }

      setPreview(data);
      setMapping(data.mapping);
      setValidation(data.validation);
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : "Preview maken is mislukt.");
    } finally {
      setIsLoading(false);
    }
  }

  async function revalidate(nextMapping: ColumnMapping) {
    if (!preview) return;
    setIsLoading(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/import/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: preview.rows, mapping: nextMapping }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Validatie is mislukt.");
      }

      setValidation(data.validation);
    } catch (validationError) {
      setError(validationError instanceof Error ? validationError.message : "Validatie is mislukt.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleMappingChange(field: ImportField, column: string) {
    const nextMapping = { ...mapping, [field]: column || undefined };
    setMapping(nextMapping);
    await revalidate(nextMapping);
  }

  async function handleConfirm() {
    if (!preview) return;
    setIsLoading(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/import/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: preview.rows, mapping }),
      });
      const data = (await response.json()) as ConfirmResponse & { error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "Import bevestigen is mislukt.");
      }

      setValidation(data.validation);
      setMessage(`Import voltooid: ${data.imported} records toegevoegd, ${data.skipped} rijen overgeslagen.`);
      router.refresh();
    } catch (confirmError) {
      setError(confirmError instanceof Error ? confirmError.message : "Import bevestigen is mislukt.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="grid gap-4">
      <form action={handlePreview} className="flex flex-wrap items-end gap-3">
        <Field label="Bestand">
          <input name="file" type="file" accept=".csv,.xlsx" className={inputClass} required />
        </Field>
        <Button type="submit" variant="secondary" disabled={isLoading}>
          <Upload size={16} />
          Preview maken
        </Button>
      </form>

      {isLoading ? (
        <div role="status" aria-live="polite" className="rounded border border-teal-200 bg-teal-50 p-3">
          <div className="mb-3 flex items-center gap-3">
            <Skeleton className="h-9 w-9 shrink-0 rounded" />
            <div>
              <div className="text-sm font-bold text-teal-950">Import wordt verwerkt</div>
              <div className="mt-0.5 text-xs text-teal-800">
                Het bestand wordt gelezen, gevalideerd en voorbereid voor import.
              </div>
            </div>
          </div>
          <SkeletonLines lines={4} />
        </div>
      ) : null}

      {error ? (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-900">{error}</div>
      ) : null}
      {message ? (
        <div className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{message}</div>
      ) : null}

      {preview && validation ? (
        <div className="grid gap-4">
          <div className="rounded border border-slate-200 bg-slate-50 p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <FileSpreadsheet size={16} />
                {preview.fileName}
              </div>
              <div className="flex flex-wrap gap-2 text-xs font-semibold">
                <span className="rounded bg-white px-2 py-1">Totaal: {validation.totalRows}</span>
                <span className="rounded bg-emerald-100 px-2 py-1 text-emerald-900">Geldig: {validation.validRows}</span>
                <span className="rounded bg-red-100 px-2 py-1 text-red-900">Fout: {validation.invalidRows}</span>
                <span className="rounded bg-amber-100 px-2 py-1 text-amber-900">
                  Duplicaten: {validation.duplicateRows}
                </span>
              </div>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            {fields.map((field) => (
              <Field key={field.value} label={`${field.label}${field.required ? " *" : ""}`}>
                <select
                  value={mapping[field.value] ?? ""}
                  onChange={(event) => void handleMappingChange(field.value, event.target.value)}
                  className={inputClass}
                >
                  <option value="">Niet gekoppeld</option>
                  {preview.columns.map((column) => (
                    <option key={column} value={column}>
                      {column}
                    </option>
                  ))}
                </select>
              </Field>
            ))}
          </div>

          <div className="overflow-x-auto rounded border border-slate-200">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 uppercase text-[var(--muted)]">
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Rij</th>
                  <th className="px-3 py-2">Medewerker</th>
                  <th className="px-3 py-2">Datum</th>
                  <th className="px-3 py-2">Uren</th>
                  <th className="px-3 py-2">Opdrachtbrief</th>
                  <th className="px-3 py-2">Taak</th>
                  <th className="px-3 py-2">Fouten</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => (
                  <tr key={row.rowNumber} className="border-b border-slate-100 align-top">
                    <td className="px-3 py-2">
                      {row.status === "valid" ? (
                        <CheckCircle2 className="text-emerald-700" size={16} />
                      ) : (
                        <XCircle className="text-red-700" size={16} />
                      )}
                    </td>
                    <td className="px-3 py-2">{row.rowNumber}</td>
                    <td className="px-3 py-2">{row.values.employee}</td>
                    <td className="px-3 py-2">{row.values.date}</td>
                    <td className="px-3 py-2">{row.values.hours}</td>
                    <td className="px-3 py-2">{row.values.contract}</td>
                    <td className="px-3 py-2">{row.values.task}</td>
                    <td className="max-w-72 px-3 py-2 text-red-800">{row.errors.join("; ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {validation.rows.length > visibleRows.length ? (
            <p className="text-xs text-[var(--muted)]">
              Preview toont de eerste {visibleRows.length} van {validation.rows.length} rijen.
            </p>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => void revalidate(mapping)} disabled={isLoading}>
              <RefreshCw size={16} />
              Opnieuw valideren
            </Button>
            <Button type="button" onClick={() => void handleConfirm()} disabled={isLoading || validation.validRows === 0}>
              <CheckCircle2 size={16} />
              {validation.validRows} geldige rijen importeren
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
