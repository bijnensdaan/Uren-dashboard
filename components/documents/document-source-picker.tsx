"use client";

import { CheckCircle2, FileUp, FolderOpen, ShieldCheck, Sparkles, Upload } from "lucide-react";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Field, inputClass } from "@/components/ui/form-fields";
import { PendingSkeleton, SubmitButton } from "@/components/ui/pending-feedback";

type StoredDoc = {
  id: string;
  fileName: string;
  mimeType: string;
  uploadedAt: string; // ISO string
};

type ContractOption = {
  id: string;
  code: string;
  name: string;
};

type DocumentSourcePickerProps = {
  contracts: ContractOption[];
  documentsByContract: Record<string, StoredDoc[]>;
  // server action — passed directly as form action
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  action: (formData: FormData) => Promise<any> | void;
  geminiConfigured: boolean;
  submitLabel: string;
  /** Optional: pre-select this contractId */
  defaultContractId?: string;
};

function formatUploadDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("nl-BE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function mimeLabel(mimeType: string): string {
  if (mimeType === "application/pdf") return "PDF";
  if (mimeType.includes("wordprocessingml")) return "DOCX";
  if (mimeType === "text/plain") return "TXT";
  return "DOC";
}

type SourceMode = "stored" | "upload";

export function DocumentSourcePicker({
  contracts,
  documentsByContract,
  action,
  geminiConfigured,
  submitLabel,
  defaultContractId,
}: DocumentSourcePickerProps) {
  const firstContractId = defaultContractId ?? contracts[0]?.id ?? "";
  const [contractId, setContractId] = useState(firstContractId);
  const [mode, setMode] = useState<SourceMode>("stored");

  const docsForContract = contractId ? (documentsByContract[contractId] ?? []) : [];
  const hasStoredDocs = docsForContract.length > 0;

  // If the selected contract has no stored docs and we're in stored mode, show upload instead
  const effectiveMode: SourceMode = mode === "stored" && !hasStoredDocs ? "stored" : mode;

  return (
    <Card className="overflow-hidden p-0">
      {/* Header */}
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded border border-teal-200 bg-white text-[var(--primary)]">
              <FileUp size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-950">
                Route A: Gemini-voorstel uit offerte/opdrachtbrief
              </h2>
              <p className="mt-1 max-w-3xl text-sm leading-5 text-[var(--muted)]">
                Kies een opgeslagen document of upload een nieuw bestand. Gemini leest de
                opdrachtgegevens uit en maakt een voorstel voor PV-stamdata en verdeelsleutel.
              </p>
            </div>
          </div>
          <div className="inline-flex items-center gap-2 rounded border border-teal-200 bg-white px-3 py-2 text-xs font-bold text-teal-800">
            <Sparkles size={14} />
            Gemini-route
          </div>
        </div>
      </div>

      <form action={action} encType="multipart/form-data" className="grid gap-4 p-4">
        {/* Contract selector */}
        <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
          <Field label="Contract">
            <select
              name="contractId"
              className={`${inputClass} h-11`}
              required
              disabled={!geminiConfigured}
              value={contractId}
              onChange={(e) => setContractId(e.target.value)}
            >
              {contracts.map((contract) => (
                <option key={contract.id} value={contract.id}>
                  {contract.code} - {contract.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {/* Source-mode toggle */}
        <div>
          <span className="mb-2 block text-sm font-medium text-slate-700">Documentbron</span>
          <div className="inline-flex rounded border border-[var(--border)] bg-slate-50 p-1 gap-1">
            <button
              type="button"
              onClick={() => setMode("stored")}
              className={`inline-flex items-center gap-2 rounded px-3 py-1.5 text-sm font-semibold transition ${
                effectiveMode === "stored"
                  ? "bg-white shadow-sm text-slate-950 border border-slate-200"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <FolderOpen size={15} />
              Opgeslagen document
            </button>
            <button
              type="button"
              onClick={() => setMode("upload")}
              className={`inline-flex items-center gap-2 rounded px-3 py-1.5 text-sm font-semibold transition ${
                effectiveMode === "upload"
                  ? "bg-white shadow-sm text-slate-950 border border-slate-200"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Upload size={15} />
              Nieuw bestand
            </button>
          </div>
        </div>

        {/* Stored document picker */}
        {effectiveMode === "stored" ? (
          <div>
            {hasStoredDocs ? (
              <Field label="Kies een opgeslagen document">
                <select name="documentId" className={`${inputClass} h-11`} required disabled={!geminiConfigured}>
                  {docsForContract.map((doc) => (
                    <option key={doc.id} value={doc.id}>
                      {doc.fileName}
                      {" — "}
                      {mimeLabel(doc.mimeType)}
                      {" · "}
                      {formatUploadDate(doc.uploadedAt)}
                    </option>
                  ))}
                </select>
              </Field>
            ) : (
              <div className="rounded border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-[var(--muted)]">
                Geen opgeslagen documenten voor dit contract — upload er één via de knop &ldquo;Nieuw
                bestand&rdquo; hierboven, of voeg toe via{" "}
                <span className="font-semibold text-slate-800">Beheer</span>.
              </div>
            )}
          </div>
        ) : (
          /* Upload mode — no documentId submitted */
          <Field label="Offerte of opdrachtbrief">
            <input
              name="file"
              type="file"
              accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
              className="h-11 w-full rounded border border-[var(--border)] bg-white px-2 text-sm text-slate-700 outline-none file:mr-3 file:rounded file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-slate-800 focus:border-[var(--primary)] focus:ring-2 focus:ring-teal-100"
              required
              disabled={!geminiConfigured}
            />
          </Field>
        )}

        {/* Submit */}
        <div className="flex items-end">
          <SubmitButton
            type="submit"
            disabled={!geminiConfigured || contracts.length === 0 || (effectiveMode === "stored" && !hasStoredDocs)}
            pendingLabel="Document uitlezen..."
            className="h-11 w-full disabled:cursor-not-allowed disabled:opacity-50 lg:w-auto"
          >
            <Upload size={16} />
            {submitLabel}
          </SubmitButton>
        </div>

        <PendingSkeleton
          title="Document wordt uitgelezen"
          description="Gemini haalt contractgegevens, PV-velden en de verdeelsleutel uit het document."
          lines={4}
        />
      </form>

      {/* Tips */}
      <div className="grid gap-2 border-t border-slate-100 px-4 pb-4 pt-3 text-xs text-slate-600 md:grid-cols-3">
        <div className="flex gap-2 rounded border border-slate-200 bg-white p-2">
          <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-700" size={15} />
          <span>
            Na het uitlezen krijg je direct een concept urenvoorstel — geen extra stap nodig.
          </span>
        </div>
        <div className="flex gap-2 rounded border border-slate-200 bg-white p-2">
          <ShieldCheck className="mt-0.5 shrink-0 text-[var(--primary)]" size={15} />
          <span>
            Je kunt daarna de percentages en het totaal aanpassen en een verfijnd voorstel maken.
          </span>
        </div>
        <div className="flex gap-2 rounded border border-slate-200 bg-white p-2">
          <FolderOpen className="mt-0.5 shrink-0 text-slate-600" size={15} />
          <span>
            Opgeslagen documenten beheer je via de pagina <span className="font-semibold">Beheer</span>.
          </span>
        </div>
      </div>

      {!geminiConfigured ? (
        <p className="mx-4 mb-4 rounded border border-amber-200 bg-amber-50 p-2 text-xs font-medium text-amber-800">
          Voeg eerst GEMINI_API_KEY toe aan .env om documentextractie te gebruiken.
        </p>
      ) : null}
    </Card>
  );
}
