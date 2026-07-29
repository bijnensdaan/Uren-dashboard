"use client";

import { CheckCircle2, FileText, FileUp, FolderOpen, ShieldCheck, Sparkles, Upload } from "lucide-react";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { FileUploadField } from "@/components/ui/file-upload-field";
import { Field, inputClass } from "@/components/ui/form-fields";
import { PendingNotice, SubmitButton } from "@/components/ui/pending-feedback";

type StoredDoc = {
  id: string;
  fileName: string;
  mimeType: string;
  kind: string;
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
  const [showDocumentChoice, setShowDocumentChoice] = useState(false);
  const [alternativeDocumentId, setAlternativeDocumentId] = useState("");

  const docsForContract = contractId ? (documentsByContract[contractId] ?? []) : [];
  const hasStoredDocs = docsForContract.length > 0;
  const officialDocument = docsForContract.find((doc) => doc.kind === "opdrachtbrief");
  const defaultDocument = officialDocument ?? docsForContract[0];
  const explicitDocumentChoice = showDocumentChoice || !officialDocument;
  const selectedDocumentId = alternativeDocumentId || defaultDocument?.id || "";

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
                De gekoppelde opdrachtbrief wordt automatisch gebruikt. Upload een nieuw bestand
                als je een andere bron wilt gebruiken voor het Gemini-voorstel.
              </p>
            </div>
          </div>
          <div className="inline-flex items-center gap-2 rounded border border-teal-200 bg-white px-3 py-2 text-xs font-bold text-teal-800">
            <Sparkles size={14} />
            Gemini-route
          </div>
        </div>
      </div>

      <form action={action} className="grid gap-4 p-4">
        {/* Opdrachtbrief selector */}
        <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
          <Field label="Opdrachtbrief">
            <select
              name="contractId"
              className={`${inputClass} h-11`}
              required
              disabled={!geminiConfigured}
              value={contractId}
              onChange={(e) => {
                setContractId(e.target.value);
                setShowDocumentChoice(false);
                setAlternativeDocumentId("");
              }}
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
              officialDocument && !explicitDocumentChoice ? (
                <>
                  <input type="hidden" name="documentId" value={selectedDocumentId} />
                  <div className="rounded-lg border border-teal-200 bg-gradient-to-b from-teal-50/70 to-white p-3 shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-teal-200 bg-white text-[var(--primary)]">
                        <FileText size={18} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-teal-700">
                          <CheckCircle2 size={13} className="shrink-0" />
                          Opdrachtbrief wordt automatisch gebruikt
                        </div>
                        {defaultDocument ? (
                          <div className="mt-1 flex items-center gap-2">
                            <span className="truncate text-sm font-medium text-slate-900" title={defaultDocument.fileName}>
                              {defaultDocument.fileName}
                            </span>
                            <span className="shrink-0 rounded border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-slate-600">
                              {mimeLabel(defaultDocument.mimeType)}
                            </span>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  {docsForContract.length > 1 ? (
                    <button
                      type="button"
                      className="mt-2 inline-flex w-fit items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-teal-300 hover:bg-teal-50 hover:text-teal-900"
                      onClick={() => {
                        setShowDocumentChoice(true);
                        setAlternativeDocumentId("");
                      }}
                    >
                      <FolderOpen size={13} className="shrink-0" />
                      Ander opgeslagen document kiezen
                    </button>
                  ) : null}
                </>
              ) : (
              <>
              <Field label="Kies een opgeslagen document">
                <select
                  name="documentId"
                  className={`${inputClass} h-11`}
                  required
                  disabled={!geminiConfigured}
                  value={selectedDocumentId}
                  onChange={(e) => setAlternativeDocumentId(e.target.value)}
                >
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
              {officialDocument ? (
                <button
                  type="button"
                  className="mt-2 w-fit text-left text-xs font-semibold text-teal-800 underline underline-offset-2 hover:text-teal-950"
                  onClick={() => {
                    setShowDocumentChoice(false);
                    setAlternativeDocumentId("");
                  }}
                >
                  Gebruik automatisch de opdrachtbrief
                </button>
              ) : null}
              </>
              )
            ) : (
              <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-gradient-to-b from-slate-50 to-white p-3 shadow-sm">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400">
                  <FileText size={18} />
                </div>
                <p className="text-sm text-[var(--muted)]">
                  Geen opgeslagen documenten voor deze opdrachtbrief — upload er één via de knop{" "}
                  <span className="font-semibold text-slate-800">&ldquo;Nieuw bestand&rdquo;</span> hierboven, of
                  voeg toe via <span className="font-semibold text-slate-800">Beheer</span>.
                </p>
              </div>
            )}
          </div>
        ) : (
          /* Upload mode — no documentId submitted */
          <Field label="Offerte of opdrachtbrief">
            <FileUploadField
              name="file"
              accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
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

        <PendingNotice text="Gemini leest het document uit — dit kan 20-30 seconden duren." />
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
