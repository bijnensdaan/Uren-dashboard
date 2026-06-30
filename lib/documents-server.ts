/**
 * Server-only helpers voor de documentenbibliotheek.
 *
 * Bestanden worden opgeslagen op schijf onder uploads/documents/.
 * De DB (Document-model) slaat alleen metadata + de relatieve bestandsnaam op.
 *
 * Exporteert:
 *   UPLOADS_DIR          — absoluut pad naar de uploads-map
 *   saveDocumentFile     — valideer + schrijf bestand + maak DB-rij
 *   deleteDocument       — verwijder bestand + DB-rij
 *   readDocumentBuffer   — lees bestandsbytes van schijf
 *   documentToGeminiInput — zet opgeslagen document om naar Gemini-invoer
 *   fileToGeminiInput    — zet een geüpload File-object om naar Gemini-invoer (DRY helper)
 */

import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { prisma } from "@/lib/db";
import { extractDocxText } from "@/lib/domain/docx-text";
import type { Document } from "@prisma/client";

// ---------------------------------------------------------------------------
// Constanten
// ---------------------------------------------------------------------------

export const UPLOADS_DIR = path.join(process.cwd(), "uploads", "documents");

const MAX_UPLOAD_BYTES = 18 * 1024 * 1024; // 18 MB — zelfde limiet als overige upload-acties

// ---------------------------------------------------------------------------
// Interne helpers
// ---------------------------------------------------------------------------

type AllowedMime =
  | "application/pdf"
  | "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  | "text/plain";

function resolveMime(file: File): AllowedMime {
  const name = file.name.toLowerCase();
  if (file.type === "application/pdf" || name.endsWith(".pdf")) {
    return "application/pdf";
  }
  if (
    file.type ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    name.endsWith(".docx")
  ) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (file.type === "text/plain" || name.endsWith(".txt")) {
    return "text/plain";
  }
  throw new Error("Upload een PDF, DOCX of TXT-bestand.");
}

function extFromMime(mime: AllowedMime): string {
  if (mime === "application/pdf") return ".pdf";
  if (
    mime ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  )
    return ".docx";
  return ".txt";
}

// ---------------------------------------------------------------------------
// saveDocumentFile
// ---------------------------------------------------------------------------

/**
 * Valideert het bestand, schrijft het naar UPLOADS_DIR en maakt een Document-rij aan.
 *
 * @param file        Het geüploade File-object (uit FormData)
 * @param contractId  Het contract waaraan het document gekoppeld wordt
 * @param kind        Documenttype (standaard "opdrachtbrief")
 */
export async function saveDocumentFile(
  file: File,
  contractId: string,
  kind = "opdrachtbrief",
): Promise<{ document: Document }> {
  // Validaties
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Geen bestand geüpload.");
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error("Bestand is te groot (max 18 MB).");
  }

  const mimeType = resolveMime(file); // gooit als type niet toegestaan
  const ext = extFromMime(mimeType);
  const storedPath = `${randomUUID()}${ext}`;
  const absolutePath = path.join(UPLOADS_DIR, storedPath);

  // Zorg dat de map bestaat
  await mkdir(UPLOADS_DIR, { recursive: true });

  // Schrijf bytes naar schijf
  const bytes = await file.arrayBuffer();
  await writeFile(absolutePath, Buffer.from(bytes));

  // Maak DB-rij aan
  const document = await prisma.document.create({
    data: {
      contractId,
      fileName: file.name,
      storedPath,
      mimeType,
      fileSize: file.size,
      kind,
    },
  });

  return { document };
}

// ---------------------------------------------------------------------------
// deleteDocument
// ---------------------------------------------------------------------------

/**
 * Verwijdert het bestand van schijf (negeert ENOENT) en daarna de DB-rij.
 */
export async function deleteDocument(documentId: string): Promise<void> {
  const document = await prisma.document.findUnique({ where: { id: documentId } });
  if (!document) {
    throw new Error("Document niet gevonden.");
  }

  const absolutePath = path.join(UPLOADS_DIR, document.storedPath);
  try {
    await unlink(absolutePath);
  } catch (err) {
    // Bestand al weg — geen probleem, rij toch verwijderen
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      throw err;
    }
  }

  await prisma.document.delete({ where: { id: documentId } });
}

// ---------------------------------------------------------------------------
// readDocumentBuffer
// ---------------------------------------------------------------------------

/**
 * Leest de bytes van een opgeslagen document van schijf.
 */
export async function readDocumentBuffer(
  documentId: string,
): Promise<{ document: Document; buffer: Buffer }> {
  const document = await prisma.document.findUnique({ where: { id: documentId } });
  if (!document) {
    throw new Error("Document niet gevonden.");
  }

  const absolutePath = path.join(UPLOADS_DIR, document.storedPath);
  const buffer = await readFile(absolutePath);
  return { document, buffer };
}

// ---------------------------------------------------------------------------
// fileToGeminiInput  (gedeelde DRY-helper voor upload-paden)
// ---------------------------------------------------------------------------

export type GeminiInput = {
  filePart?: { mimeType: string; dataBase64: string };
  sourceText?: string;
};

/**
 * Zet een geüpload File-object om naar het formaat dat de Gemini-acties verwachten.
 *
 * Routing (identiek aan de bestaande logica in app/actions.ts en app/planning/actions.ts):
 *   pdf  → filePart { mimeType, dataBase64 }
 *   docx → sourceText = extractDocxText(buffer)
 *   txt  → sourceText = buffer.toString("utf-8")
 *   overig → Error
 */
export async function fileToGeminiInput(file: File): Promise<GeminiInput> {
  const mime = resolveMime(file); // gooit bij ongeldig type
  const buffer = Buffer.from(await file.arrayBuffer());

  if (mime === "application/pdf") {
    return {
      filePart: { mimeType: "application/pdf", dataBase64: buffer.toString("base64") },
    };
  }
  if (
    mime ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return { sourceText: await extractDocxText(buffer) };
  }
  // text/plain
  return { sourceText: buffer.toString("utf-8") };
}

// ---------------------------------------------------------------------------
// documentToGeminiInput  (voor opgeslagen documenten)
// ---------------------------------------------------------------------------

/**
 * Leest een opgeslagen document van schijf en zet het om naar Gemini-invoer.
 * Gebruikt dezelfde routing als fileToGeminiInput.
 *
 * Gebruik dit in Simulatie- en Planning-acties om een gekozen bibliotheekdocument
 * door te sturen naar Gemini in plaats van een vers geüploaded bestand.
 */
export async function documentToGeminiInput(documentId: string): Promise<
  GeminiInput & { document: Document }
> {
  const { document, buffer } = await readDocumentBuffer(documentId);

  const mime = document.mimeType as AllowedMime;

  if (mime === "application/pdf") {
    return {
      document,
      filePart: { mimeType: "application/pdf", dataBase64: buffer.toString("base64") },
    };
  }
  if (
    mime ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return { document, sourceText: await extractDocxText(buffer) };
  }
  if (mime === "text/plain") {
    return { document, sourceText: buffer.toString("utf-8") };
  }

  throw new Error("Upload een PDF, DOCX of TXT-bestand.");
}
