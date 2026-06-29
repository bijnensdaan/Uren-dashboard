import { CheckCircle2, FileUp, ShieldCheck, Sparkles, Upload } from "lucide-react";
import { extractAllocationFromFile } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, inputClass } from "@/components/ui/form-fields";

type AiDocumentUploadCardProps = {
  contracts: Array<{
    id: string;
    code: string;
    name: string;
  }>;
  geminiConfigured: boolean;
};

export function AiDocumentUploadCard({
  contracts,
  geminiConfigured,
}: AiDocumentUploadCardProps) {
  return (
    <Card className="overflow-hidden p-0">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded border border-teal-200 bg-white text-[var(--primary)]">
              <FileUp size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-950">Route A: AI-voorstel uit offerte/opdrachtbrief</h2>
              <p className="mt-1 max-w-3xl text-sm leading-5 text-[var(--muted)]">
                Upload een PDF of DOCX. Gemini leest de opdrachtgegevens uit en maakt een voorstel voor PV-stamdata en verdeelsleutel.
              </p>
            </div>
          </div>
          <div className="inline-flex items-center gap-2 rounded border border-teal-200 bg-white px-3 py-2 text-xs font-bold text-teal-800">
            <Sparkles size={14} />
            AI-route
          </div>
        </div>
      </div>

      <form
        action={extractAllocationFromFile}
        encType="multipart/form-data"
        className="grid gap-4 p-4 lg:grid-cols-[0.95fr_1.15fr_150px] lg:items-end"
      >
        <Field label="Contract">
          <select name="contractId" className={`${inputClass} h-11`} required disabled={!geminiConfigured}>
            {contracts.map((contract) => (
              <option key={contract.id} value={contract.id}>
                {contract.code} - {contract.name}
              </option>
            ))}
          </select>
        </Field>

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

        <Button
          type="submit"
          disabled={!geminiConfigured || contracts.length === 0}
          className="h-11 w-full disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Upload size={16} />
          Document uitlezen
        </Button>
      </form>

      <div className="grid gap-2 border-t border-slate-100 px-4 pb-4 pt-3 text-xs text-slate-600 md:grid-cols-3">
        <div className="flex gap-2 rounded border border-slate-200 bg-white p-2">
          <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-700" size={15} />
          <span>PV-velden zoals titel, referentie, bestekcode en namen worden voorgesteld.</span>
        </div>
        <div className="flex gap-2 rounded border border-slate-200 bg-white p-2">
          <ShieldCheck className="mt-0.5 shrink-0 text-[var(--primary)]" size={15} />
          <span>Urenbudget en profielmix worden alleen voorgesteld, niet automatisch definitief.</span>
        </div>
        <div className="flex gap-2 rounded border border-slate-200 bg-white p-2">
          <Upload className="mt-0.5 shrink-0 text-slate-600" size={15} />
          <span>Na upload controleer je het voorstel en zet je het om naar een simulatie.</span>
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
