import { readFileSync } from "node:fs";
import path from "node:path";
import {
  AlignmentType,
  BorderStyle,
  Document,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import type { PvFacturatie } from "./pv";

/**
 * Deterministische generatie van het proces-verbaal als .docx, in de structuur
 * van de bestaande bestanden in docs/. Gemini levert enkel de tekstvelden
 * (deliverables + de twee vaste alinea's); alle cijfers, uren, dagen en bedragen
 * komen uit de domeinlogica. Pagina-opmaak overgenomen uit het referentiebestand:
 * A4, Calibri 11, identieke marges en kolombreedtes van de facturatietabel.
 */
export type PvDocxModel = {
  contractCode: string;
  contractName: string;
  periodStart: string;
  periodEnd: string;
  orderLetterReference: string;
  bestelbon: string;
  financieleEmail: string;
  effort: Array<{ profileName: string; days: number }>;
  deliverables: string[];
  orderLetterSentence: string;
  transmissionSentence: string;
  facturatie: PvFacturatie;
  alreadyInvoiced: number;
  totalBudgetAmount: number;
  date: string;
  domainManagerName: string;
  domainManagerRole: string;
  domainManagerOrg: string;
  projectLeadNames: string;
  projectLeadRole: string;
  projectLeadOrg: string;
};

const FONT = "Calibri";
// Kolombreedtes facturatietabel (DXA): profiel, eenheidsprijs, uren, dagen, prijs, btw, totaal
const TABLE_COLS = [1383, 1512, 950, 970, 1559, 1418, 1568];
const TABLE_TOTAL_W = TABLE_COLS.reduce((a, b) => a + b, 0);

const euroNF = new Intl.NumberFormat("nl-BE", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const euro2NF = new Intl.NumberFormat("nl-BE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const numNF = new Intl.NumberFormat("nl-BE", { maximumFractionDigits: 1 });

const euro = (value: number) => `€ ${euroNF.format(Math.round(value))}`;
const euro2 = (value: number) => `€ ${euro2NF.format(value)}`;

function text(value: string, opts: { bold?: boolean; size?: number } = {}) {
  return new TextRun({ text: value, bold: opts.bold, font: FONT, size: opts.size ?? 22 });
}

function para(runs: TextRun[], opts: { spacingAfter?: number; spacingBefore?: number } = {}) {
  return new Paragraph({
    children: runs,
    spacing: { after: opts.spacingAfter ?? 120, before: opts.spacingBefore ?? 0 },
  });
}

function heading(value: string) {
  return new Paragraph({ children: [text(value, { bold: true })], spacing: { before: 240, after: 120 } });
}

function bullet(value: string) {
  return new Paragraph({ children: [text(value)], bullet: { level: 0 }, spacing: { after: 40 } });
}

function noBorders() {
  const none = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  return { top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: none };
}

const thinBorder = { style: BorderStyle.SINGLE, size: 4, color: "999999" };
const tableBorders = {
  top: thinBorder,
  bottom: thinBorder,
  left: thinBorder,
  right: thinBorder,
  insideHorizontal: thinBorder,
  insideVertical: thinBorder,
};

function cell(
  value: string,
  opts: {
    bold?: boolean;
    align?: (typeof AlignmentType)[keyof typeof AlignmentType];
    columnSpan?: number;
    shading?: string;
  } = {},
) {
  return new TableCell({
    children: [
      new Paragraph({
        children: [text(value, { bold: opts.bold })],
        alignment: opts.align ?? AlignmentType.LEFT,
        spacing: { after: 0 },
      }),
    ],
    margins: { top: 40, bottom: 40, left: 80, right: 80 },
    columnSpan: opts.columnSpan,
    shading: opts.shading ? { fill: opts.shading } : undefined,
  });
}

function buildFacturatieTable(model: PvDocxModel) {
  const R = AlignmentType.RIGHT;

  // Eerste rij: "Gegevens" | "Te factureren periode ..." (spanning 6 kolommen)
  const metaRow = new TableRow({
    children: [
      cell("Gegevens", { bold: true }),
      cell(`Te factureren periode ${model.periodStart} – ${model.periodEnd}`, { columnSpan: 6 }),
    ],
  });

  const headerRow = new TableRow({
    tableHeader: true,
    children: [
      cell("profiel", { bold: true }),
      cell("eenheidsprijs (excl. btw)", { bold: true }),
      cell("uren", { bold: true, align: R }),
      cell("dagen", { bold: true, align: R }),
      cell("prijs", { bold: true, align: R }),
      cell("btw", { bold: true, align: R }),
      cell("totaal prijs (incl. btw)", { bold: true, align: R }),
    ],
  });

  const lineRows = model.facturatie.lines.map(
    (line) =>
      new TableRow({
        children: [
          cell(line.profileName),
          cell(euro2(line.unitPrice), { align: R }),
          cell(numNF.format(line.hours), { align: R }),
          cell(numNF.format(line.days), { align: R }),
          cell(euro(line.amountExclVat), { align: R }),
          cell(euro(line.vatAmount), { align: R }),
          cell(euro(line.amountInclVat), { align: R }),
        ],
      }),
  );

  const totals = model.facturatie.totals;
  const totalRow = new TableRow({
    children: [
      cell("Totalen", { bold: true }),
      cell("", { bold: true }),
      cell(numNF.format(totals.hours), { bold: true, align: R }),
      cell(numNF.format(totals.days), { bold: true, align: R }),
      cell(euro(totals.amountExclVat), { bold: true, align: R }),
      cell(euro(totals.vatAmount), { bold: true, align: R }),
      cell(euro(totals.amountInclVat), { bold: true, align: R }),
    ],
  });

  return new Table({
    columnWidths: TABLE_COLS,
    width: { size: TABLE_TOTAL_W, type: WidthType.DXA },
    borders: tableBorders,
    rows: [metaRow, headerRow, ...lineRows, totalRow],
  });
}

function buildBudgetTable(model: PvDocxModel) {
  const R = AlignmentType.RIGHT;
  // Breedte: 2 kolommen links (label + bedrag), 2 rechts (label + bedrag)
  const halfW = Math.floor(TABLE_TOTAL_W / 2);
  const colWidths = [halfW - 1200, 1200, halfW - 1200, 1200];

  const row1 = new TableRow({
    children: [
      cell("Reeds gefactureerd:"),
      cell(euro(model.alreadyInvoiced), { bold: true, align: R }),
      cell("van het beschikbare totaalbudget van:"),
      cell(euro2(model.totalBudgetAmount), { bold: true, align: R }),
    ],
  });
  const row2 = new TableRow({
    children: [
      cell("Totaal te factureren bedrag voor huidig proces-verbaal (incl. btw):", { bold: true, columnSpan: 3 }),
      cell(euro(model.facturatie.totals.amountInclVat), { bold: true, align: R }),
    ],
  });

  return new Table({
    columnWidths: colWidths,
    width: { size: TABLE_TOTAL_W, type: WidthType.DXA },
    borders: tableBorders,
    rows: [row1, row2],
  });
}

function signatureBlock(model: PvDocxModel) {
  const colLines = (name: string, role: string, org: string) =>
    [name, role, ...org.split("\n")].filter(Boolean).map(
      (line, index) =>
        new Paragraph({
          children: [text(line, { bold: index === 0 })],
          spacing: { after: 0 },
        }),
    );

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: noBorders(),
    rows: [
      new TableRow({
        children: [
          new TableCell({
            margins: { top: 40, bottom: 40, left: 0, right: 200 },
            children: colLines(model.domainManagerName || "…", model.domainManagerRole, model.domainManagerOrg),
          }),
          new TableCell({
            margins: { top: 40, bottom: 40, left: 200, right: 0 },
            children: colLines(model.projectLeadNames || "…", model.projectLeadRole, model.projectLeadOrg),
          }),
        ],
      }),
    ],
  });
}

function loadLogo(): ImageRun | null {
  try {
    const data = readFileSync(path.join(process.cwd(), "public", "pv-logo.png"));
    return new ImageRun({ data, type: "png", transformation: { width: 224, height: 49 } });
  } catch {
    return null;
  }
}

export async function buildPvDocx(model: PvDocxModel): Promise<Buffer> {
  const logo = loadLogo();
  const children: (Paragraph | Table)[] = [];

  if (logo) {
    children.push(new Paragraph({ children: [logo], spacing: { after: 240 } }));
  }

  // ONDERWERP/BETREFT — label + inhoud in zelfde alinea (zoals referentie)
  children.push(
    para([
      text("ONDERWERP/BETREFT", { bold: true }),
      text(
        `\tProces-verbaal van tussentijdse oplevering van geleverde prestaties gedurende de periode ${model.periodStart} – ${model.periodEnd} in het kader van ${model.contractCode} “${model.contractName}”.`,
      ),
    ]),
  );

  // UW REFERENTIE
  if (model.orderLetterReference) {
    children.push(
      para([text("UW REFERENTIE", { bold: true }), text(`\t${model.orderLetterReference}`)]),
    );
  }

  // FEDCOM Bestelbonnummer
  if (model.bestelbon) {
    children.push(para([text(`FEDCOM Bestelbonnummer: ${model.bestelbon}`)]));
  }

  // Financiële dienst UHasselt
  if (model.financieleEmail) {
    children.push(para([text(`Financiële dienst UHasselt:\t${model.financieleEmail}`)]));
  }

  children.push(heading("Opgeleverde diensten en uitgevoerde taken:"));

  children.push(para([text("Inzet van:", { bold: true })], { spacingAfter: 40 }));
  for (const line of model.effort) {
    children.push(bullet(`${line.profileName}: ${numNF.format(line.days)} persoondagen`));
  }

  children.push(para([text("Ter realisatie van:", { bold: true })], { spacingAfter: 40 }));
  for (const deliverable of model.deliverables) {
    children.push(bullet(deliverable));
  }

  children.push(para([text(model.orderLetterSentence)], { spacingAfter: 80 }));
  children.push(para([text(model.transmissionSentence)], { spacingAfter: 160 }));

  children.push(heading("Facturatie:"));
  children.push(buildFacturatieTable(model));

  // Budget-overzichtstabel (Reeds gefactureerd / totaalbudget / totaal te factureren)
  children.push(buildBudgetTable(model));

  children.push(para([text(`Datum: ${model.date || "…"}`)], { spacingBefore: 240, spacingAfter: 360 }));
  children.push(signatureBlock(model));

  const doc = new Document({
    styles: { default: { document: { run: { font: FONT, size: 22 } } } },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11910, height: 16840 },
            margin: { top: 1920, right: 1280, bottom: 1720, left: 1260 },
          },
        },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}
