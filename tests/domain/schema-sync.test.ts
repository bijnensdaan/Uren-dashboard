import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Bewakingstest: prisma/postgres/schema.prisma is een kopie van
// prisma/schema.prisma (alleen de datasource-provider verschilt) en moet bij
// elke schemawijziging mee worden bijgewerkt tot de PostgreSQL-omschakeling.
// Deze test vergelijkt beide schema's blok voor blok, met commentaar en
// witruimte genormaliseerd, zodat een vergeten sync direct opvalt.

const ROOT = join(__dirname, "..", "..");

type SchemaBlok = { soort: string; naam: string; inhoud: string };

/**
 * Verwijdert commentaar en overtollige witruimte, zodat alleen inhoudelijke
 * verschillen tellen. Regelcommentaar (// ...) mag nooit een verschil zijn.
 */
function normaliseerRegels(bron: string): string[] {
  return bron
    .split(/\r?\n/)
    .map((regel) => {
      // Verwijder regelcommentaar (het schema gebruikt geen strings met "//").
      const zonderCommentaar = regel.replace(/\/\/.*$/, "");
      // Normaliseer interne witruimte, zodat kolomuitlijning niet meetelt.
      return zonderCommentaar.trim().replace(/\s+/g, " ");
    })
    .filter((regel) => regel.length > 0);
}

/** Splitst een Prisma-schema in blokken (generator/datasource/model). */
function parseBlokken(bron: string): SchemaBlok[] {
  const regels = normaliseerRegels(bron);
  const blokken: SchemaBlok[] = [];
  let huidig: SchemaBlok | null = null;

  for (const regel of regels) {
    const kop = regel.match(/^(generator|datasource|model|enum)\s+(\S+)\s*\{/);
    if (kop) {
      huidig = { soort: kop[1], naam: kop[2], inhoud: "" };
      continue;
    }
    if (regel === "}") {
      if (huidig) {
        blokken.push(huidig);
        huidig = null;
      }
      continue;
    }
    if (huidig) {
      huidig.inhoud += `${regel}\n`;
    }
  }
  return blokken;
}

const sqliteSchema = readFileSync(join(ROOT, "prisma", "schema.prisma"), "utf8");
const postgresSchema = readFileSync(join(ROOT, "prisma", "postgres", "schema.prisma"), "utf8");

const sqliteBlokken = parseBlokken(sqliteSchema);
const postgresBlokken = parseBlokken(postgresSchema);

function blok(blokken: SchemaBlok[], soort: string, naam?: string) {
  return blokken.find((item) => item.soort === soort && (naam === undefined || item.naam === naam));
}

describe("schema-sync: prisma/postgres/schema.prisma vs prisma/schema.prisma", () => {
  it("heeft in beide schema's een datasource met een provider-regel (provider mag verschillen)", () => {
    const sqliteDatasource = blok(sqliteBlokken, "datasource");
    const postgresDatasource = blok(postgresBlokken, "datasource");
    expect(sqliteDatasource, "prisma/schema.prisma mist een datasource-blok").toBeDefined();
    expect(postgresDatasource, "prisma/postgres/schema.prisma mist een datasource-blok").toBeDefined();
    expect(sqliteDatasource!.inhoud).toMatch(/^provider = /m);
    expect(postgresDatasource!.inhoud).toMatch(/^provider = /m);
    // De rest van het datasource-blok (zonder de provider-regel) moet wel gelijk zijn.
    const zonderProvider = (inhoud: string) =>
      inhoud
        .split("\n")
        .filter((regel) => !regel.startsWith("provider = "))
        .join("\n");
    expect(
      zonderProvider(postgresDatasource!.inhoud),
      "prisma/postgres/schema.prisma is niet in sync met prisma/schema.prisma; het datasource-blok wijkt af (buiten de provider-regel) — werk beide bij",
    ).toBe(zonderProvider(sqliteDatasource!.inhoud));
  });

  it("heeft identieke generator-blokken", () => {
    const sqliteGenerator = blok(sqliteBlokken, "generator");
    const postgresGenerator = blok(postgresBlokken, "generator");
    expect(sqliteGenerator, "prisma/schema.prisma mist een generator-blok").toBeDefined();
    expect(postgresGenerator, "prisma/postgres/schema.prisma mist een generator-blok").toBeDefined();
    expect(
      postgresGenerator!.inhoud,
      "prisma/postgres/schema.prisma is niet in sync met prisma/schema.prisma; het generator-blok wijkt af — werk beide bij",
    ).toBe(sqliteGenerator!.inhoud);
  });

  it("bevat exact dezelfde modellen", () => {
    const sqliteNamen = sqliteBlokken.filter((item) => item.soort === "model").map((item) => item.naam);
    const postgresNamen = postgresBlokken.filter((item) => item.soort === "model").map((item) => item.naam);
    expect(
      postgresNamen,
      "prisma/postgres/schema.prisma is niet in sync met prisma/schema.prisma; de lijst van modellen wijkt af — werk beide bij",
    ).toEqual(sqliteNamen);
  });

  it("heeft per model identieke inhoud (commentaar en witruimte tellen niet mee)", () => {
    for (const sqliteModel of sqliteBlokken.filter((item) => item.soort === "model")) {
      const postgresModel = blok(postgresBlokken, "model", sqliteModel.naam);
      expect(
        postgresModel,
        `prisma/postgres/schema.prisma is niet in sync met prisma/schema.prisma; model ${sqliteModel.naam} ontbreekt — werk beide bij`,
      ).toBeDefined();
      expect(
        postgresModel!.inhoud,
        `prisma/postgres/schema.prisma is niet in sync met prisma/schema.prisma; model ${sqliteModel.naam} wijkt af — werk beide bij`,
      ).toBe(sqliteModel.inhoud);
    }
  });
});
