import type { Document } from "@prisma/client";
import { deleteContractDocument, uploadContractDocument } from "@/app/admin/actions/documents";
import { extractContractInsights } from "@/app/admin/actions/ai-setup";
import { ConfirmSubmitButton } from "@/components/admin/confirm-submit-button";
import { humanFileSize, mimeLabel, SubCard } from "@/components/admin/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/ui/form-fields";
import { PendingNotice, SubmitButton } from "@/components/ui/pending-feedback";
import { formatDate } from "@/lib/utils";

/**
 * Sub-sectie "Opdrachtbrieven & documenten" binnen een contract-accordion:
 * documenten uploaden, AI-uitlezing starten en de documentenlijst beheren.
 */
export function ContractDocumentsSection({
  contractId,
  documents,
}: {
  contractId: string;
  documents: Document[];
}) {
  return (
    <SubCard
      title={`Opdrachtbrieven & documenten${documents.length > 0 ? ` (${documents.length})` : ""}`}
      helper="Upload hier de opdrachtbrief of bijbehorende documenten. Op de pagina's Simulatie en Planning kun je deze documenten daarna kiezen."
      defaultOpen
    >
      {/* Upload form voor dit contract */}
      <form
        action={uploadContractDocument}
        className="mb-3 flex flex-wrap items-end gap-2"
      >
        <input type="hidden" name="contractId" value={contractId} />
        <label className="grid flex-1 gap-1 text-sm font-medium text-slate-700">
          <span>Bestand kiezen (PDF, Word of tekst)</span>
          <input
            type="file"
            name="file"
            accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
            className={inputClass}
            required
          />
        </label>
        <Button type="submit">Document toevoegen</Button>
      </form>

      <form
        action={extractContractInsights}
        className="mb-4 grid gap-3 rounded border border-teal-100 bg-teal-50/60 p-3"
      >
        <input type="hidden" name="contractId" value={contractId} />
        {documents.length === 0 ? (
          <p className="text-xs text-[var(--muted)]">
            Upload eerst een document om AI-uitlezing te starten.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-end gap-2">
              <label className="grid flex-1 gap-1 text-sm font-medium text-slate-700">
                <span>Document kiezen voor AI-uitlezing</span>
                <select name="documentId" className={inputClass} required>
                  {documents.map((doc) => (
                    <option key={doc.id} value={doc.id}>
                      {doc.fileName}
                    </option>
                  ))}
                </select>
              </label>
              <SubmitButton type="submit" pendingLabel="Gemini leest uit...">
                Uitlezen met AI
              </SubmitButton>
            </div>
            <PendingNotice text="Gemini leest het document uit — verdeelsleutel, tarieven, totaaluren, PV-stamdata en fasering worden opgehaald." />
          </>
        )}
      </form>

      {/* Lijst van documenten van dit contract */}
      {documents.length === 0 ? (
        <p className="text-xs text-[var(--muted)]">
          Nog geen documenten voor dit contract.
        </p>
      ) : (
        <div className="grid gap-2">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-100 bg-white px-3 py-2"
            >
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                <Badge className="shrink-0 border-slate-200 bg-slate-100 text-slate-600">
                  {mimeLabel(doc.mimeType)}
                </Badge>
                <span className="truncate text-sm font-medium text-slate-800">
                  {doc.fileName}
                </span>
                <span className="text-xs text-[var(--muted)]">
                  {humanFileSize(doc.fileSize)}
                </span>
                <span className="text-xs text-[var(--muted)]">
                  · {formatDate(doc.uploadedAt)}
                </span>
              </div>
              <form action={deleteContractDocument}>
                <input type="hidden" name="documentId" value={doc.id} />
                <ConfirmSubmitButton
                  confirmMessage={`Document "${doc.fileName}" definitief verwijderen? Dit kan niet ongedaan worden gemaakt.`}
                  label="Verwijderen"
                  variant="danger"
                />
              </form>
            </div>
          ))}
        </div>
      )}
    </SubCard>
  );
}
