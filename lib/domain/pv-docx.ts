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
const TABLE_COLS = [1383, 1512, 950, 970, 1559, 1418, 1568];

const euroNF = new Intl.NumberFormat("nl-BE", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const euro2NF = new Intl.NumberFormat("nl-BE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const numNF = new Intl.NumberFormat("nl-BE", { maximumFractionDigits: 1 });

const euro = (value: number) => `€ ${euroNF.format(Math.round(value))}`;
const euro2 = (value: number) => `€ ${euro2NF.format(value)}`;

function text(value: string, opts: { bold?: boolean; size?: number } = {}) {
  return new TextRun({ text: value, bold: opts.bold, font: FONT, size: opts.size ?? 22 });
}

function para(runs: TextRun[], opts: { spacingAfter?: number; bold?: boolean } = {}) {
  return new Paragraph({ children: runs, spacing: { after: opts.spacingAfter ?? 120 } });
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

function cell(value: string, opts: { bold?: boolean; align?: (typeof AlignmentType)[keyof typeof AlignmentType] } = {}) {
  return new TableCell({
    children: [
      new Paragraph({
        children: [text(value, { bold: opts.bold })],
        alignment: opts.align ?? AlignmentType.LEFT,
        spacing: { after: 0 },
      }),
    ],
    margins: { top: 40, bottom: 40, left: 80, right: 80 },
  });
}

function buildFacturatieTable(model: PvDocxModel) {
  const R = AlignmentType.RIGHT;
  const header = new TableRow({
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

  const border = { style: BorderStyle.SINGLE, size: 4, color: "999999" };
  return new Table({
    columnWidths: TABLE_COLS,
    width: { size: TABLE_COLS.reduce((a, b) => a + b, 0), type: WidthType.DXA },
    borders: {
      top: border,
      bottom: border,
      left: border,
      right: border,
      insideHorizontal: border,
      insideVertical: border,
    },
    rows: [header, ...lineRows, totalRow],
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

  // Referentieblok bovenaan (onderwerp + uw referentie), zoals het kopblok in de PV's.
  children.push(
    para([
      text("Onderwerp/betreft: ", { bold: true }),
      text(
        `Proces-verbaal van tussentijdse oplevering van geleverde prestaties gedurende de periode ${model.periodStart} – ${model.periodEnd} in het kader van ${model.contractCode} “${model.contractName}”.`,
      ),
    ]),
  );
  if (model.orderLetterReference) {
    children.push(para([text("Uw referentie: ", { bold: true }), text(model.orderLetterReference)]));
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
  children.push(para([text(`Te factureren periode ${model.periodStart} – ${model.periodEnd}`)], { spacingAfter: 120 }));
  children.push(buildFacturatieTable(model));

  children.push(
    new Paragraph({ children: [text("Reeds gefactureerd: "), text(euro(model.alreadyInvoiced), { bold: true })], spacing: { before: 240, after: 0 } }),
  );
  children.push(
    new Paragraph({ children: [text("van het beschikbare totaalbudget van: "), text(euro2(model.totalBudgetAmount), { bold: true })], spacing: { after: 0 } }),
  );
  children.push(
    new Paragraph({
      children: [
        text("Totaal te factureren bedrag voor huidig proces-verbaal (incl. btw): ", { bold: true }),
        text(euro(model.facturatie.totals.amountInclVat), { bold: true }),
      ],
      spacing: { after: 240 },
    }),
  );

  children.push(para([text(`Datum: ${model.date || "…"}`)], { spacingAfter: 360 }));
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
