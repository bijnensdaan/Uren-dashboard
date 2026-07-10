"use client";

import { Loader2 } from "lucide-react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type SubmitButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger";
  pendingLabel?: string;
};

export function SubmitButton({
  children,
  disabled,
  pendingLabel = "Bezig...",
  variant = "primary",
  ...props
}: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant={variant} disabled={pending || disabled} {...props}>
      {pending ? <Loader2 size={16} className="animate-spin" /> : null}
      {pending ? pendingLabel : children}
    </Button>
  );
}

export function PendingNotice({
  text = "Bezig met verwerken...",
  className,
}: {
  text?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  if (!pending) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "mt-2 inline-flex items-center gap-2 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700",
        className,
      )}
    >
      <Loader2 size={14} className="animate-spin text-[var(--primary)]" />
      {text}
    </div>
  );
}
