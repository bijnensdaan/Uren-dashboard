"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { saveDocumentFile, deleteDocument } from "@/lib/documents-server";
import { go } from "./helpers";

// ---------------------------------------------------------------------------
// Documentenbibliotheek
// ---------------------------------------------------------------------------

/**
 * Upload een document en koppel het aan een contract.
 * FormData-velden: contractId (string), file (File).
 */
export async function uploadContractDocument(formData: FormData) {
  try {
    const contractId = String(formData.get("contractId") ?? "");
    const file = formData.get("file");
    const kind = String(formData.get("kind") ?? "bijlage").trim() || "bijlage";
    const description = String(formData.get("description") ?? "").trim();

    if (kind !== "opdrachtbrief" && !description) {
      throw new Error("Geef voor een project, rapport of bijlage een beschrijving op die in het PV kan verschijnen.");
    }

    if (!contractId) {
      throw new Error("Kies eerst een contract.");
    }
    if (!(file instanceof File) || file.size === 0) {
      throw new Error("Geen bestand geüpload.");
    }

    const contract = await prisma.contract.findUnique({ where: { id: contractId } });
    if (!contract) {
      throw new Error("Contract niet gevonden.");
    }

    await saveDocumentFile(file, contractId, kind, description);
  } catch (error) {
    return go(
      error instanceof Error ? error.message : "Document uploaden is mislukt.",
      "error",
    );
  }
  revalidatePath("/admin");
  return go("Document geüpload.");
}

/**
 * Verwijder een document (bestand + DB-rij).
 * FormData-velden: documentId (string).
 */
export async function deleteContractDocument(formData: FormData) {
  try {
    const documentId = String(formData.get("documentId") ?? "");
    if (!documentId) {
      throw new Error("Geen document opgegeven.");
    }
    await deleteDocument(documentId);
  } catch (error) {
    return go(
      error instanceof Error ? error.message : "Document verwijderen is mislukt.",
      "error",
    );
  }
  revalidatePath("/admin");
  return go("Document verwijderd.");
}

export async function updateContractDocument(formData: FormData) {
  try {
    const documentId = String(formData.get("documentId") ?? "");
    const kind = String(formData.get("kind") ?? "bijlage").trim() || "bijlage";
    const description = String(formData.get("description") ?? "").trim();
    if (!documentId) throw new Error("Geen document opgegeven.");
    if (kind !== "opdrachtbrief" && !description) {
      throw new Error("Geef voor een project, rapport of bijlage een beschrijving op die in het PV kan verschijnen.");
    }
    await prisma.document.update({
      where: { id: documentId },
      data: { kind, description: description || null },
    });
  } catch (error) {
    return go(error instanceof Error ? error.message : "Document bijwerken is mislukt.", "error");
  }
  revalidatePath("/admin");
  revalidatePath("/reports");
  return go("Documentbeschrijving bijgewerkt.");
}
