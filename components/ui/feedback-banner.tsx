import { AlertCircle, CheckCircle2 } from "lucide-react";

/**
 * Gedeelde succes-/foutbanner voor feedback via query-params (zie lib/feedback.ts).
 * Groene variant voor succes, rode variant met "Er ging iets mis:"-prefix voor fouten.
 */
export function FeedbackBanner({
  type,
  children,
}: {
  type: "success" | "error";
  children: React.ReactNode;
}) {
  if (type === "error") {
    return (
      <div className="flex items-start gap-3 rounded border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        <AlertCircle size={18} className="mt-0.5 shrink-0 text-red-600" />
        <div>
          <span className="font-semibold">Er ging iets mis: </span>
          {children}
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-3 rounded border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
      <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-600" />
      <div>{children}</div>
    </div>
  );
}
