"use client";

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
  return (
    <Button
      type="submit"
      variant={variant}
      onClick={(e) => {
        if (!window.confirm(confirmMessage)) {
          e.preventDefault();
        }
      }}
    >
      {label}
    </Button>
  );
}
