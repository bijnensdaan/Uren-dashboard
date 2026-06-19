import Link from "next/link";
import { CheckCircle2, Clock, FileSearch } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import type { AllocationSuggestion } from "@/lib/domain/allocation-suggestion";
import { formatDate, formatHours } from "@/lib/utils";

type AiExtractionHistoryItem = {
  id: string;
  contractCode: string;
  contractName: string;
  sourceText: string;
  model: string;
  createdAt: Date;
  acceptedAt: Date | null;
  suggestion: AllocationSuggestion;
};

export function AiExtractionHistory({ items }: { items: AiExtractionHistoryItem[] }) {
  return (
    <Card>
      <CardHeader
        title="Recente AI-extracties"
        description="Laatste offerte- en opdrachtbriefvoorstellen met status."
      />
      {items.length === 0 ? (
        <div className="rounded border border-slate-200 bg-slate-50 p-3 text-sm text-[var(--muted)]">
          Nog geen AI-extracties. Upload een opdrachtbrief om hier de opvolging te zien.
        </div>
      ) : (
        <div className="grid gap-2">
          {items.map((item) => {
            const hasContractData = Boolean(item.suggestion.extractedContract);
            return (
              <Link
                key={item.id}
                href={`/simulations?suggestion=${item.id}`}
                className="rounded border border-slate-200 bg-white p-3 text-sm transition hover:border-teal-200 hover:bg-teal-50"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-950">
                      {item.contractCode} - {item.contractName}
                    </div>
                    <div className="mt-1 truncate text-xs text-[var(--muted)]">{item.sourceText}</div>
                  </div>
                  <Badge
                    className={
                      item.acceptedAt
                        ? "gap-1 border-emerald-200 bg-emerald-50 text-emerald-800"
                        : "gap-1 border-amber-200 bg-amber-50 text-amber-800"
                    }
                  >
                    {item.acceptedAt ? (
                      <>
                        <CheckCircle2 size={12} />
                        Gebruikt
                      </>
                    ) : (
                      <>
                        <Clock size={12} />
                        Review
                      </>
                    )}
                  </Badge>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-[var(--muted)]">
                  <span>{formatDate(item.createdAt)}</span>
                  <span>{item.model}</span>
                  {item.suggestion.suggestedTotalHours ? (
                    <span>{formatHours(item.suggestion.suggestedTotalHours)}</span>
                  ) : null}
                  {hasContractData ? (
                    <span className="inline-flex items-center gap-1 text-teal-800">
                      <FileSearch size={12} />
                      PV-data gevonden
                    </span>
                  ) : null}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </Card>
  );
}
