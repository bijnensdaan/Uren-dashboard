"use client";

import { Loader2 } from "lucide-react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Skeleton, SkeletonLines } from "@/components/ui/skeleton";
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

export function PendingSkeleton({
  title = "Bezig met verwerken",
  description = "De gegevens worden voorbereid. Dit kan enkele seconden duren.",
  lines = 3,
  className,
}: {
  title?: string;
  description?: string;
  lines?: number;
  className?: string;
}) {
  const { pending } = useFormStatus();
  if (!pending) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn("rounded border border-teal-200 bg-teal-50 p-3", className)}
    >
      <div className="mb-3 flex items-center gap-3">
        <Skeleton className="h-9 w-9 shrink-0 rounded" />
        <div>
          <div className="text-sm font-bold text-teal-950">{title}</div>
          <div className="mt-0.5 text-xs text-teal-800">{description}</div>
        </div>
      </div>
      <SkeletonLines lines={lines} />
    </div>
  );
}
