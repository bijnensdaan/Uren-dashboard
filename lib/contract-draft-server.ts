/**
 * Server-only helpers voor opdrachtbrief-concepten (drafts).
 *
 * Na het uploaden van een opdrachtbrief wordt de Gemini-uitlezing NIET meteen
 * als contract opgeslagen, maar eerst als concept op schijf gezet
 * (uploads/drafts/<id>.json, inclusief de originele bestandsbytes). De
 * beheerpagina toont het concept ter controle; pas bij bevestigen wordt het
 * contract echt aangemaakt en wordt het concept weer verwijderd.
 */

import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import type { ContractSetup } from "@/lib/domain/contract-setup-extraction";

export type ContractDraft = {
  id: string;
  fileName: string;
  mimeType: string;
  fileBase64: string;
  model: string;
  setup: ContractSetup;
  createdAt: string; // ISO
};

const DRAFTS_DIR = path.join(process.cwd(), "uploads", "drafts");

/** Alleen UUID-achtige id's toestaan — voorkomt path traversal via de query-param. */
function assertValidDraftId(id: string) {
  if (!/^[a-f0-9-]{10,64}$/i.test(id)) {
    throw new Error("Ongeldig concept-id.");
  }
}

export async function saveContractDraft(
  input: Omit<ContractDraft, "id" | "createdAt">,
): Promise<ContractDraft> {
  const draft: ContractDraft = {
    ...input,
    id: randomUUID(),
    createdAt: new Date().toISOString(),
  };
  await mkdir(DRAFTS_DIR, { recursive: true });
  await writeFile(path.join(DRAFTS_DIR, `${draft.id}.json`), JSON.stringify(draft), "utf-8");
  return draft;
}

export async function loadContractDraft(id: string): Promise<ContractDraft | null> {
  try {
    assertValidDraftId(id);
    const raw = await readFile(path.join(DRAFTS_DIR, `${id}.json`), "utf-8");
    return JSON.parse(raw) as ContractDraft;
  } catch {
    return null;
  }
}

export async function deleteContractDraft(id: string): Promise<void> {
  assertValidDraftId(id);
  try {
    await unlink(path.join(DRAFTS_DIR, `${id}.json`));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}

/** Zet de opgeslagen bestandsbytes terug om naar een File voor hergebruik. */
export function draftToFile(draft: ContractDraft): File {
  const buffer = Buffer.from(draft.fileBase64, "base64");
  return new File([new Uint8Array(buffer)], draft.fileName, { type: draft.mimeType });
}
