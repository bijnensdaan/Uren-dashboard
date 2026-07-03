"use client";

import { Loader2, Trash2 } from "lucide-react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

/**
 * Compacte verwijderknop voor een tabelrij, met hetzelfde confirm-patroon als
 * components/admin/confirm-submit-button.tsx.
 */
export function DeleteEntryButton({ confirmMessage }: { confirmMessage: string }) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      variant="danger"
      className="h-8 px-2"
      title="Verwijderen"
      disabled={pending}
      onClick={(e) => {
        if (!window.confirm(confirmMessage)) {
          e.preventDefault();
        }
      }}
    >
      {pending ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
    </Button>
  );
}
