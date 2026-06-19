# Plan: AI-suggestie verdeelsleutel en AI-gegenereerde PV's

## Status

- **Stap 1 geïmplementeerd (AI-suggestie verdeelsleutel).** De percentage-suggestie per profiel draait nu via de **Google Gemini API** (REST `generateContent` met `responseSchema` voor gegarandeerde gestructureerde output). Concreet:
  - `lib/domain/allocation-suggestion.ts`: types `AllocationSuggestionInput`/`AllocationSuggestion`, de Gemini-call `suggestAllocationPercentages`, en `normalizeSuggestionPercentages` die de AI-output naar een som van exact 100 corrigeert (hergebruikt `normalizePercentages` uit `lib/domain/simulation.ts` — AI-output wordt niet blind vertrouwd).
  - Env-variabelen `GEMINI_API_KEY` (verplicht, geen default) en `GEMINI_MODEL` (default `gemini-2.5-flash`) toegevoegd aan `.env.example`.
  - Prisma-model `AllocationSuggestion` (`id`, `contractId`, `sourceText`, `suggestedJson`, `model`, `createdAt`, `acceptedAt?`) toegevoegd. **Afwijking t.o.v. plan:** dit project gebruikt geen `prisma migrate` maar `prisma db push` (er bestaat geen `prisma/migrations/`-map en de npm-scripts gebruiken `db:push`/`db:reset`); het schema is met `npx prisma db push` toegepast in plaats van `migrate dev` om de bestaande workflow niet te breken.
  - Server actions `suggestAllocation` en `acceptAllocationSuggestion` in `app/actions.ts`; `createSimulation` is uitgebreid zodat het optioneel een expliciete set percentages (`allocationsJson`) aanvaardt naast de standaard `ContractAllocationTemplate`. `createSimulationProposal` zelf is ongewijzigd — alleen de bron van `targetPercentage` verschilt.
  - UI-sectie "AI-voorstel verdeelsleutel" in `app/simulations/page.tsx` met textarea + contractkeuze, bewerkbare percentage-inputs met motivatie, en een knop "Gebruiken voor simulatie". De bestaande standaardverdeelsleutel-flow blijft volledig intact.
  - Het voorstel neemt ook een `suggestedTotalHours` op: als de tekst expliciet een aantal voorziene werkuren/uren-budget noemt, wordt dat letterlijk overgenomen (niet berekend) en vult het veld "Totaal voorziene uren" automatisch in; anders blijft de standaard 380 staan. De gebruiker kan het altijd aanpassen.
  - Getest: `npm run test:domain` (normalisatie sommeert naar 100, ook bij off-by en geschaalde AI-input; uren-verdeling klopt met `createSimulationProposal`), `npx tsc --noEmit`, `npm run build`, en een render-smoketest van `/simulations`. Een live Gemini-call vereist een geldige `GEMINI_API_KEY` (de waarde in `.env.example` is een placeholder).
- **Stap 2 (gedeeltelijk) geïmplementeerd: AI-PV-tekst via Gemini + PV-layout in de structuur van de docs/-bestanden.** De bestaande OpenAI-conceptgenerator is op vraag **gemigreerd naar Gemini**; de oude `lib/domain/ai-report.ts` en de `OPENAI_*`-env-variabelen zijn verwijderd. Concreet:
  - `lib/domain/gemini.ts`: gedeelde `callGeminiStructured`-helper (REST `generateContent` + `responseSchema`), `getGeminiModel`, `isGeminiConfigured`.
  - `lib/domain/pv-narrative.ts`: `generatePvNarrative` levert **alleen tekst** (`deliverablesBullets` = "Ter realisatie van", `orderLetterSentence`, `transmissionSentence`) in de stijl van de bestaande PV's, met few-shot stijlvoorbeeld. `flagUnsupportedBullets` markeert bullets zonder trefwoord-overlap met de aangeleverde notities ("controleer dit").
  - `lib/domain/pv.ts`: **deterministische** facturatie-berekening (`buildPvFacturatie`: uren, dagen = uren/7,6, prijs, btw, totaal incl. btw + totalenrij) en `PvData` (periode, btw%, reeds gefactureerd, totaalbudget, bestek/opdrachtbrief, datum, domeinmanager/projectleiders, eenheidsprijs per profiel). Geen AI-cijfers. Live geverifieerd tegen de echte AVSA24-PV: bedragen komen tot op €1 afrondingsruis overeen.
  - `DeliveryReport` uitgebreid met `pvNarrativeJson` (AI-tekst, concept→goedgekeurd) en `pvDataJson` (door gebruiker ingevulde cijfers/namen). Toegepast met `prisma db push`.
  - `app/actions.ts`: `generateReportAiDraft` roept nu Gemini aan (i.p.v. OpenAI); `saveReportAiDraft` slaat de bewerkte bullets/zinnen op en keurt goed; nieuwe `savePvData` bewaart de PV-gegevens.
  - `app/reports/[id]/page.tsx`: nieuw **PV-gegevens-formulier** + **AI-assistent (Gemini)** + een **printbare PV** met de docx-structuur (kop/referentie, "Opgeleverde diensten", "Inzet van" persoondagen, "Ter realisatie van" bullets, twee vaste alinea's, Facturatie-tabel, reeds gefactureerd/totaalbudget/totaal te factureren, Datum, handtekeningblok met domeinmanager + projectleiders).
- **Dag-lengte & facturatie-afronding (afstemming op de docs/-Excels).** Een volledige dag is op vraag gewijzigd naar **8 uur** (`FULL_DAY_HOURS = 8`, `HALF_DAY_HOURS = 4`) en geldt consequent in de hele app, inclusief de PV-"dagen". Let op: de bestaande PV's/Excels in docs/ rekenen `dagen = uren ÷ 7,6`; met 8 u/dag wijkt de dagenkolom dus bewust af van die oude documenten (bv. 45,6 u = 5,7 dagen i.p.v. 6). De **euro-bedragen veranderen niet** door de dag-lengte, want de eenheidsprijs is per uur. De facturatie-berekening in `lib/domain/pv.ts` is bovendien gelijkgetrokken met de methode uit het Excel-tabblad "Overzicht bedragen": `prijs = uren × eenheidsprijs` op **volledige precisie** (niet afgerond op hele euro's), `btw = prijs × btw%`, totalen uit de som van de exacte regels — geverifieerd tot op de cent tegen het AVSA24-bestand (totaal incl. € 104.432,08 vs Excel € 104.432,075).
- **Nog niet gedaan in Stap 2**: echte `.docx`-export (de PV is nu een printbare HTML/Print-naar-PDF-pagina, geen gegenereerd Word-bestand met logo-asset), het `Invoice`-model/automatische "reeds gefactureerd"-historiek, en de tarieven/btw als contract-niveau velden (nu per PV ingevuld via `pvDataJson` i.p.v. de Stap 0 `ProfileRate`/`Contract`-velden).

## Doel

Twee AI-uitbreidingen op de bestaande simulatie- en PV-flow:

1. Een AI-call die, vóór de berekening, een voorstel doet voor de **verdeelsleutel** (percentages per profiel) op basis van de offerte/opdrachtbrief of een vrije beschrijving.
2. Een AI-call die, na de berekening, de **PV-tekst** genereert in de structuur en lay-out van de bestaande PV's in `docs/`, gevuld met de al berekende cijfers.

Uitgangspunt, ongewijzigd ten opzichte van `NEXT_STEPS_PLAN.md`: AI levert input (percentages) en tekst, nooit de uren-, prijs- of btw-berekening zelf. Die blijft in `lib/domain`.

## Wat de bestaande PV's voorschrijven

Op basis van de drie geanalyseerde bestanden (`PV van oplevering AVSA24 1 maart 2026 - 30 april 2026.docx`, `... AVSA24 1 januari 2026 - 28 februari 2026.docx`, `... POC AIR-RIA 1 maart 2026 - 30 april 2026.docx`) is de structuur per PV:

1. Logo (afbeelding, vast, ca. 2,33 x 0,5 inch).
2. Kop "Opgeleverde diensten en uitgevoerde taken:".
3. "Inzet van:" — bullet list per profiel met persoondagen (bv. "Manager: 6 persoondagen"). Profielen zonder uren worden weggelaten (AIR-RIA-PV heeft geen manager-regel).
4. "Ter realisatie van:" — bullet list van taken/deliverables/rapporten, vrije tekst, contractspecifiek.
5. Vaste alinea: "Alle opdrachten zijn uitgevoerd volgens de bepalingen van de opdrachtbrief "&lt;titel&gt;" &lt;referentienummer, optioneel&gt; en in overeenstemming met de bepalingen van het bestek &lt;bestekcode&gt; en de UHasselt offerte."
6. Vaste alinea: "De gepresteerde uren ter uitvoering van de bovenstaande opdrachten voor de periode &lt;startdatum&gt; – &lt;einddatum&gt; werden overgemaakt aan de DAV/FOD BOSA projectleider."
7. Kop "Facturatie:" met tabel:
   - Kolommen: profiel, eenheidsprijs (excl. btw), uren, dagen, prijs, btw, totaal prijs (incl. btw).
   - Eén rij per profiel met >0 uren, plus een totaalrij.
8. Blok met "Reeds gefactureerd: € X" / "van het beschikbare totaalbudget van: € Y" / "Totaal te factureren bedrag voor huidig proces-verbaal (incl. btw): € Z" (vet).
9. Datum (tekstregel "Datum: &lt;datum&gt;").
10. Handtekeningblok, twee kolommen: naam + functie + organisatie van Domeinmanager (vast per contractfamilie) en naam + functie van projectleider(s) (kan meerdere namen bevatten, gescheiden door " - ").

Cijfers die hiervoor nodig zijn en **nu nergens in het schema staan**: eenheidsprijs per profiel (excl. btw), btw-percentage/-bedrag, reeds gefactureerd bedrag (cumulatief per contract), totaalbudget in euro (naast het bestaande `totalBudgetHours`), bestekcode, opdrachtbrief-titel/referentienummer, domeinmanager- en projectleider-namen/functies.

## Stap 0 — Schema-uitbreidingen (voorwaarde voor beide AI-stappen)

Zonder deze velden kan geen van de twee AI-stappen een correcte PV vullen, dus dit moet eerst.

In `prisma/schema.prisma`:

- `Contract`: voeg toe `totalBudgetAmount Float?` (budget in euro), `vatPercentage Float @default(21)`, `orderLetterTitle String?`, `orderLetterReference String?`, `specificationCode String?` (bestekcode), `domainManagerName String?`, `domainManagerRole String?`, `projectLeadNames String?` (vrije tekst, kan meerdere namen bevatten).
- Nieuw model `ProfileRate`: `id`, `contractId`, `profileCategoryId`, `unitPrice Float` (eenheidsprijs excl. btw per uur), unique op `[contractId, profileCategoryId]`. Apart model in plaats van een veld op `ContractAllocationTemplate`, omdat tarieven kunnen wijzigen zonder dat de verdeelsleutel wijzigt.
- Nieuw model `Invoice` (facturatiehistoriek per PV): `id`, `contractId`, `deliveryReportId @unique`, `periodStart`, `periodEnd`, `amountExclVat`, `vatAmount`, `amountInclVat`, `createdAt`. Dit maakt "Reeds gefactureerd" een berekening (som van eerdere invoices voor het contract) in plaats van een handmatig in te tikken getal — consistent met de regel dat domeinlogica de bron van cijfers is.
- `DeliveryReport`: voeg toe `periodStart DateTime?`, `periodEnd DateTime?`, `docxDraftStatus String @default("not_requested")` (los van het bestaande `aiDraftStatus`, dat de vrije-tekst-AI-flow blijft bedienen), `docxGeneratedAt DateTime?`, `docxFilePath String?`.

Migratie: `npx prisma migrate dev --name pv_invoicing_fields`. Bestaande contracten krijgen deze velden via het beheer-CRUD (`app/admin`) ingevuld — geen seed-verzinsels.

## Stap 1 — AI-suggestie verdeelsleutel

### Domeinlaag

Nieuw bestand `lib/domain/allocation-suggestion.ts`:

```ts
export type AllocationSuggestionInput = {
  contractCode: string;
  contractName: string;
  sourceText: string; // vrije tekst: opgeplakte offerte/opdrachtbrief of beschrijving
  knownProfiles: Array<{ profileCategoryId: string; profileName: string }>;
  comparableContracts?: Array<{
    contractCode: string;
    allocations: Array<{ profileName: string; targetPercentage: number }>;
  }>;
};

export type AllocationSuggestion = {
  lines: Array<{ profileCategoryId: string; profileName: string; suggestedPercentage: number; rationale: string }>;
  overallRationale: string;
};
```

`comparableContracts` wordt opgehaald via `prisma.contractAllocationTemplate` van actieve contracten — dit geeft de AI feitelijke precedenten in plaats van te gokken in het ijle.

### AI-call

Zelfde patroon als `generateAiReportDraft` in `lib/domain/ai-report.ts`: Responses API, `json_schema` met `strict: true`, schema afgedwongen op `{ lines: [...], overallRationale }`, percentages als getallen. Systeeminstructie: "Je stelt een percentageverdeling voor over profielen (manager, expert/senior, junior) op basis van de aangeleverde offerte- of opdrachtbrieftekst en vergelijkbare contracten. Je berekent geen uren of bedragen. Percentages per voorstel moeten optellen tot 100."

Na de call: valideer in code dat de percentages binnen afrondingstolerantie (±0,5) op 100 sommeren; corrigeer zoals `normalizePercentages` in `lib/domain/simulation.ts` al doet. Vertrouw de AI niet blind op deze rekenregel.

### Flow / UI

Nieuwe server action `suggestAllocation(formData)` in `app/actions.ts`:
- Input: `contractId`, `sourceText` (textarea, evt. gevuld door geplakte tekst van een geüploade offerte — hergebruik bestaande upload/parse-laag uit `lib/import-server.ts` enkel om tekst uit een geüpload bestand te halen, niet om het te valideren als time-entries).
- Roept `suggestAllocationPercentages(input)` aan, slaat resultaat **niet automatisch op** maar retourneert het naar de pagina via een tussentijdse staat (vergelijkbaar met hoe `deliveryReport.aiDraftStatus` een concept bijhoudt vóór goedkeuring).
- Nieuw Prisma-model `AllocationSuggestion` (optioneel, voor traceerbaarheid): `id`, `contractId`, `sourceText`, `suggestedJson`, `model`, `createdAt`, `acceptedAt DateTime?`.

In `app/simulations/page.tsx`: nieuwe sectie boven het simulatieformulier — "AI-voorstel verdeelsleutel" met een tekstveld voor de offerte/opdrachtbrief-tekst en een knop "Voorstel genereren". Resultaat verschijnt als bewerkbare percentage-inputs per profiel (vooringevuld met het AI-voorstel), met een knop "Gebruiken voor simulatie" die deze percentages als `AllocationInput[]` doorgeeft aan `createSimulation` in plaats van de standaard `ContractAllocationTemplate`-percentages. `createSimulationProposal` zelf wijzigt niet — het ontvangt gewoon een andere bron voor `targetPercentage`.

### Acceptatiecriteria

- Een gebruiker kan tekst van een offerte/opdrachtbrief plakken en een AI-voorstel voor percentages per profiel krijgen, met motivatie.
- Percentages in het voorstel sommeren altijd tot 100 (gecorrigeerd in code, niet enkel vertrouwd van de AI).
- De gebruiker ziet het voorstel als concept en moet het bevestigen vóór het in de simulatie wordt gebruikt; de standaard contractsleutel blijft het alternatief.
- `createSimulationProposal` en de uren-berekening blijven ongewijzigd: enkel de bron van de percentages verandert.

## Stap 2 — AI-gegenereerde PV (docx, structuur van bestaande PV's)

### Domeinlaag

Nieuw bestand `lib/domain/pv-draft.ts`, naast het bestaande `lib/domain/report.ts` (dat de HTML-rapportweergave blijft bedienen — niet vervangen, want dat voedt de schermweergave op `/reports/[id]`).

```ts
export type PvSnapshot = {
  contract: {
    code: string; name: string;
    orderLetterTitle: string; orderLetterReference?: string; specificationCode: string;
    domainManagerName: string; domainManagerRole: string; projectLeadNames: string;
    totalBudgetAmount: number; vatPercentage: number;
  };
  period: { start: string; end: string };
  lines: Array<{
    profileName: string; hours: number; days: number;
    unitPrice: number; amountExclVat: number; vatAmount: number; amountInclVat: number;
  }>;
  totals: { hours: number; days: number; amountExclVat: number; vatAmount: number; amountInclVat: number };
  previouslyInvoiced: number; // som van Invoice.amountInclVat voor dit contract, eerdere periodes
  date: string;
};

export function buildPvSnapshot(input: ...): PvSnapshot { /* pure berekening: dagen = uren / 7,6 etc, alle bedragen hier */ }
```

Dit is de uitbreiding van het bestaande `buildAiReportSnapshot`-idee, maar dan met de facturatievelden die de PV-tabel nodig heeft. Alle bedragen (`amountExclVat = hours * unitPrice`, `vatAmount = amountExclVat * vatPercentage / 100`, dagen via `HALF_DAY_HOURS`/`FULL_DAY_HOURS`-logica uit `lib/domain/calculations.ts`) worden hier berekend, niet door AI.

### AI-call

Nieuwe functie `generatePvNarrative(snapshot: PvSnapshot, taskNotes: string[])` in `lib/domain/pv-draft.ts`, zelfde Responses-API-patroon als `generateAiReportDraft`:

- **Input naar de AI**: de `PvSnapshot` (cijfers, ter info/consistentiecontrole, niet om over te typen) plus `taskNotes` — vrije tekst die de gebruiker aanlevert (bv. samengevoegde `notes`-velden van `TimeEntry` voor de periode, of handmatig ingevoerde deliverable-titels) en één representatief bestaand PV-fragment als stijlvoorbeeld (de "Ter realisatie van"-sectie van een eerdere PV, **geanonimiseerd qua bedragen**, hardcoded als few-shot voorbeeld in de prompt).
- **Output-schema** (`json_schema`, `strict: true`):
  ```ts
  {
    deliverablesBullets: string[];      // "Ter realisatie van"-lijst
    orderLetterSentence: string;        // de vaste verwijzingsalinea, met titel/bestek ingevuld
    transmissionSentence: string;       // "gepresteerde uren ... werden overgemaakt" alinea
  }
  ```
- Systeeminstructie, naar het patroon van `ai-report.ts`: "Je herschrijft uitsluitend tekstuele velden voor een proces-verbaal van oplevering, in de stijl van het aangeleverde voorbeeld. Je gebruikt geen cijfers, bedragen, uren, dagen of percentages anders dan letterlijk overgenomen uit de aangeleverde snapshot. Verzin geen deliverables die niet in de aangeleverde notities staan."
- `deliverablesBullets` mag alleen items bevatten die herleidbaar zijn tot `taskNotes` — geen vrije invulling. Dit is moeilijk hard af te dwingen via het schema alleen; voeg daarom een validatiestap toe die elk gegenereerd bullet-item met een eenvoudige overlap-check (bv. gedeelde trefwoorden) tegen `taskNotes` aflegt, en bullets zonder enige match naar een "controleer dit"-markering stuurt in de UI in plaats van ze stilzwijgend te accepteren.

### Docx-generatie

Nieuw bestand `lib/domain/pv-docx.ts` (of een script onder `scripts/` dat bij export wordt aangeroepen) dat met de `docx`-library (zie docx-skill) een bestand opbouwt dat de vaste structuur (stap "Wat de bestaande PV's voorschrijven" hierboven) namaakt:

- Logo: hergebruik het PNG uit één bestaand PV-bestand (`docs/.../media/image1.png` na unpack) als vaste asset, bv. opgeslagen onder `public/pv-logo.png`.
- Tabel: zelfde kolommen/volgorde/vetgedrukte totaalrij als de drie geanalyseerde bestanden, met dynamische rijen (alleen profielen met >0 uren).
- Tekstvelden: gevuld met `deliverablesBullets`, `orderLetterSentence`, `transmissionSentence` uit de AI-output, en met de cijfers uit `PvSnapshot` (nooit AI-tekst voor de tabel of de drie financiële totalen onderaan).
- Handtekeningblok: twee kolommen met `domainManagerName`/`domainManagerRole` en `projectLeadNames`, exact het twee-koloms-patroon (zie docx-skill: tabstops of layout-tabel, geen losse tekstblokken die niet uitlijnen).

### Flow / server action

Nieuwe server action `generatePvDocx(formData)`:
1. Haalt `DeliveryReport` + gekoppelde `Simulation`/`Contract`/`Invoice`-historie op.
2. Bouwt `PvSnapshot` via `buildPvSnapshot`.
3. Roept `generatePvNarrative` aan, zet `docxDraftStatus = "generating"` dan `"draft"` (zelfde statusmachine als `aiDraftStatus` nu).
4. Toont het concept (bullets, zinnen) op `/reports/[id]` naast de bestaande AI-tekstsectie, bewerkbaar.
5. Bij bevestiging (`approveDocxDraft`): genereert het `.docx`-bestand via `pv-docx.ts`, slaat het op (bv. onder een `outputs`-pad), zet `docxDraftStatus = "approved"`, `docxGeneratedAt`, `docxFilePath`, en maakt een `Invoice`-record aan met de bedragen uit `PvSnapshot.totals` (zodat "reeds gefactureerd" bij de volgende PV automatisch klopt).

### Acceptatiecriteria

- Een gegenereerde PV volgt zichtbaar dezelfde kop-, tabel- en handtekenblokstructuur als de bestaande bestanden in `docs/`.
- Alle bedragen, uren, dagen en btw in de PV komen uit `PvSnapshot`/domeinlogica; de AI levert enkel de bullet-lijst en de twee vaste alinea's.
- "Reeds gefactureerd" en "totaalbudget" kloppen automatisch met eerdere goedgekeurde PV's van hetzelfde contract, zonder handmatige invoer per PV.
- De gebruiker keurt de tekst goed vóór het bestand definitief wordt gegenereerd en de `Invoice` wordt aangemaakt.

## Volgorde van bouwen

1. Schema-uitbreidingen (stap 0) + admin-UI om de nieuwe contractvelden (tarieven, btw, opdrachtbrief-titel, namen) in te vullen voor bestaande contracten.
2. `buildPvSnapshot` + niet-AI docx-generatie met handmatig ingevulde deliverable-tekst, om de layout-namaak te valideren tegen de drie bestaande bestanden vóór AI in de lus komt.
3. AI-narrative-call (stap 2) bovenop de werkende docx-generatie.
4. AI-verdeelsleutel-suggestie (stap 1) — onafhankelijk van 2-3, kan parallel.

Deze volgorde zet de risicovolste aanname (kan ik de exacte lay-out van een complex Belgisch overheids-PV met tabellen en handtekeningblok betrouwbaar namaken met docx-js) zo vroeg mogelijk, vóór er AI-afhankelijkheden bovenop komen.
