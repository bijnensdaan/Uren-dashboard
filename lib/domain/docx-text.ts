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
