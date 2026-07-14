type PvDocument = {
  fileName: string;
  kind: string;
  description: string | null;
};

/**
 * Maakt oude documentrecords zonder PV-beschrijving toch leesbaar. Nieuwe
 * bijlagen moeten bij upload een expliciete beschrijving krijgen; dit vangnet
 * is uitsluitend bedoeld voor eerder opgeslagen gegevens.
 */
export function descriptionFromFileName(fileName: string) {
  return fileName
    .replace(/\.[^.]+$/, "")
    .replace(/_/g, " ")
    .replace(/^N\d{4}\s+\d{2}\s+\d{2}\s+/i, "")
    .replace(/\s+(?:VF|FINAAL)(?:\s+\d{1,2}\s+[A-Za-z]+\s+\d{4})?$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Alleen bijbehorende projecten, rapporten en andere bijlagen zijn
 * realisaties. De opdrachtbrief zelf hoort nooit onder "Ter realisatie van".
 */
export function pvDocumentDescriptions(documents: PvDocument[]) {
  return documents
    .filter((document) => document.kind.trim().toLowerCase() !== "opdrachtbrief")
    .map((document) => document.description?.trim() || descriptionFromFileName(document.fileName))
    .filter(Boolean);
}

function comparisonKey(value: string) {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[“”„'‘’`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Combineert documentbeschrijvingen met de overige PV-realisaties zonder
 * dezelfde omschrijving tweemaal te tonen door verschillen in leestekens.
 */
export function mergePvDeliverables(...groups: string[][]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of groups.flat()) {
    const trimmed = value.trim();
    const key = comparisonKey(trimmed);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }

  return result;
}
