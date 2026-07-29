"use client";

import { FileUp } from "lucide-react";
import { useId, useState } from "react";
import { cn } from "@/lib/utils";

type FileUploadFieldProps = {
  name: string;
  accept?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  buttonLabel?: string;
  emptyLabel?: string;
};

export function FileUploadField({
  name,
  accept,
  required,
  disabled,
  className,
  buttonLabel = "Bestand kiezen",
  emptyLabel = "Geen bestand gekozen",
}: FileUploadFieldProps) {
  const id = useId();
  const [fileName, setFileName] = useState("");

  return (
    <div
      className={cn(
        "flex min-h-10 w-full items-center gap-2 rounded border border-[var(--border)] bg-white p-1.5 text-sm shadow-sm transition focus-within:border-[var(--primary)] focus-within:ring-2 focus-within:ring-teal-100",
        disabled && "bg-slate-50 opacity-60",
        className,
      )}
    >
      <input
        id={id}
        name={name}
        type="file"
        accept={accept}
        required={required}
        disabled={disabled}
        className="sr-only"
        onChange={(event) => {
          setFileName(event.currentTarget.files?.[0]?.name ?? "");
        }}
      />
      <label
        htmlFor={id}
        className={cn(
          "inline-flex h-8 shrink-0 cursor-pointer items-center gap-2 rounded border border-teal-200 bg-teal-50 px-3 text-sm font-semibold text-teal-900 shadow-sm transition hover:border-teal-300 hover:bg-teal-100",
          disabled && "cursor-not-allowed hover:border-teal-200 hover:bg-teal-50",
        )}
      >
        <FileUp size={15} />
        {buttonLabel}
      </label>
      <span
        className={cn("min-w-0 truncate text-sm text-slate-600", fileName && "font-medium text-slate-900")}
        title={fileName || emptyLabel}
      >
        {fileName || emptyLabel}
      </span>
    </div>
  );
}
