"use client";

import { Loader2 } from "lucide-react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

type ConfirmSubmitButtonProps = {
  confirmMessage: string;
  label: string;
  variant?: "primary" | "secondary" | "danger";
};

export function ConfirmSubmitButton({
  confirmMessage,
  label,
  variant = "danger",
}: ConfirmSubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      variant={variant}
      disabled={pending}
      onClick={(e) => {
        if (!window.confirm(confirmMessage)) {
          e.preventDefault();
        }
      }}
    >
      {pending ? <Loader2 size={16} className="animate-spin" /> : null}
      {pending ? "Bezig..." : label}
    </Button>
  );
}
