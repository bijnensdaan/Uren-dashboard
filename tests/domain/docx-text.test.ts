import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { extractDocxText, extractDocxCoreDates } from "../../lib/domain/docx-text";

/** Bouwt een minimale docx (OOXML ZIP) in memory voor de tests. */
async function buildDocx(options: {
  bodyXml?: string;
  coreXml?: string | null;
}): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    "word/document.xml",
    options.bodyXml ??
      "<w:document><w:body><w:p><w:r><w:t>Hallo wereld</w:t></w:r></w:p></w:body></w:document>",
  );
  if (options.coreXml !== null) {
    zip.file(
      "docProps/core.xml",
      options.coreXml ??
        '<cp:coreProperties><dcterms:created xsi:type="dcterms:W3CDTF">2025-09-17T14:32:00Z</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">2025-09-18T08:00:00Z</dcterms:modified></cp:coreProperties>',
    );
  }
  return zip.generateAsync({ type: "nodebuffer" });
}

describe("extractDocxText", () => {
  it("haalt platte tekst uit het document", async () => {
    const buffer = await buildDocx({});
    expect(await extractDocxText(buffer)).toBe("Hallo wereld");
  });

  it("gooit een duidelijke fout bij een ongeldig bestand", async () => {
    await expect(extractDocxText(Buffer.from("geen zip"))).rejects.toThrow(
      "Kon het .docx-bestand niet openen",
    );
  });
});

describe("extractDocxCoreDates", () => {
  it("leest aanmaak- en wijzigingsdatum uit docProps/core.xml", async () => {
    const buffer = await buildDocx({});
    expect(await extractDocxCoreDates(buffer)).toEqual({
      created: "2025-09-17",
      modified: "2025-09-18",
    });
  });

  it("geeft null-velden terug zonder core.xml", async () => {
    const buffer = await buildDocx({ coreXml: null });
    expect(await extractDocxCoreDates(buffer)).toEqual({ created: null, modified: null });
  });

  it("gooit nooit, ook niet bij een ongeldig bestand", async () => {
    expect(await extractDocxCoreDates(Buffer.from("geen zip"))).toEqual({
      created: null,
      modified: null,
    });
  });
});
