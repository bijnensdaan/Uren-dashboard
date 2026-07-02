/**
 * Haalt platte tekst uit een .docx-bestand (OOXML ZIP) zonder extra dependencies.
 * JSZip is een transitieve dependency die al aanwezig is in node_modules.
 */
import JSZip from "jszip";

export async function extractDocxText(data: Buffer | Uint8Array): Promise<string> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(data);
  } catch (cause) {
    throw new Error(
      "Kon het .docx-bestand niet openen. Zorg dat het een geldig Word-document is.",
    );
  }

  const docEntry = zip.file("word/document.xml");
  if (!docEntry) {
    throw new Error("Kon de tekst niet uit het .docx-bestand halen.");
  }

  let xml: string;
  try {
    xml = await docEntry.async("string");
  } catch (cause) {
    throw new Error("Kon de tekst niet uit het .docx-bestand halen.");
  }

  // Optioneel: ook headers/footers meenemen als ze aanwezig zijn
  const extras: string[] = [];
  for (const [name, entry] of Object.entries(zip.files)) {
    if (/^word\/(header|footer)\d*\.xml$/.test(name)) {
      try {
        extras.push(await entry.async("string"));
      } catch {
        // negeer kapotte header/footer
      }
    }
  }

  const combined = [xml, ...extras].join("\n");

  const text = combined
    // Alinea-einde → newline zodat woorden niet aan elkaar plakken
    .replace(/<\/w:p>/g, "\n")
    // Regelafbrekingen en tabs → spatie
    .replace(/<w:br\/>/gi, " ")
    .replace(/<w:tab\/>/gi, " ")
    // Alle overige XML-tags verwijderen
    .replace(/<[^>]+>/g, "")
    // XML-entiteiten decoderen
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    // Overbodige witruimte opschonen
    .replace(/\s+/g, " ")
    .trim();

  if (!text) {
    throw new Error("Het .docx-bestand bevat geen leesbare tekst.");
  }

  return text;
}

/**
 * Leest de aanmaak- en wijzigingsdatum uit de docx-metadata (docProps/core.xml).
 * Handig als datum-anker wanneer de documenttekst zelf geen letterlijke datums
 * bevat (bv. "vanaf datum van goedkeuring"). Geeft null-velden terug als de
 * metadata ontbreekt of onleesbaar is; gooit nooit.
 */
export async function extractDocxCoreDates(
  data: Buffer | Uint8Array,
): Promise<{ created: string | null; modified: string | null }> {
  try {
    const zip = await JSZip.loadAsync(data);
    const coreEntry = zip.file("docProps/core.xml");
    if (!coreEntry) return { created: null, modified: null };
    const xml = await coreEntry.async("string");

    const readDate = (tag: string): string | null => {
      const match = xml.match(new RegExp(`<dcterms:${tag}[^>]*>([^<]+)</dcterms:${tag}>`));
      if (!match) return null;
      const isoDay = match[1].trim().slice(0, 10);
      return /^\d{4}-\d{2}-\d{2}$/.test(isoDay) ? isoDay : null;
    };

    return { created: readDate("created"), modified: readDate("modified") };
  } catch {
    return { created: null, modified: null };
  }
}
