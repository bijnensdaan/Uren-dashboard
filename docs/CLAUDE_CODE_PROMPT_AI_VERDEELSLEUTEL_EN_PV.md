## Prompt voor Claude Code

Plak het onderstaande in Claude Code binnen deze repo.

---

Lees eerst `docs/PLAN_AI_VERDEELSLEUTEL_EN_PV.md` en `docs/NEXT_STEPS_PLAN.md` volledig, en bekijk `lib/domain/ai-report.ts` en `app/actions.ts` als referentiepatroon voor hoe AI-calls en concept/goedkeuringsflows in dit project zijn opgebouwd.

Implementeer **stap 0 en stap 1** uit `docs/PLAN_AI_VERDEELSLEUTEL_EN_PV.md`: de AI-suggestie voor de verdeelsleutel (percentages per profiel). Stap 2 (AI-gegenereerde PV-docx) implementeer je niet in deze opdracht.

### AI-provider: Google Gemini, niet OpenAI

Dit project gebruikt momenteel `OPENAI_API_KEY`/`OPENAI_MODEL` met de OpenAI Responses API in `lib/domain/ai-report.ts`. Voor deze nieuwe functionaliteit gebruik je in plaats daarvan de **Gemini API**, met eigen env-variabelen:

- `GEMINI_API_KEY` (verplicht, geen default)
- `GEMINI_MODEL` met een redelijke default (gebruik een actueel Gemini-model met sterke structured-output-ondersteuning; check de officiële Gemini API-documentatie voor de huidige model-naam en het juiste eindpunt in plaats van een naam te raden)

Voeg beide toe aan `.env.example` (lege/placeholder-waarden, geen echte key) naast de bestaande `OPENAI_*`-variabelen. Wijzig niets aan de bestaande OpenAI-integratie in `ai-report.ts` — die blijft ongewijzigd naast deze nieuwe Gemini-integratie bestaan.

Gebruik Gemini's **structured output / response schema-functionaliteit** (vergelijkbaar doel als de `json_schema`-met-`strict: true`-aanpak die nu voor OpenAI wordt gebruikt) zodat de output gegarandeerd in het juiste formaat terugkomt. Zoek de exacte API-vorm op in de Gemini-documentatie (REST-eindpunt, hoe een response-schema wordt meegegeven, hoe het antwoord uit de response gehaald wordt) — verzin de aanroepstructuur niet uit analogie met OpenAI, want die verschilt.

### Wat te bouwen

**1. Domeinlaag — `lib/domain/allocation-suggestion.ts` (nieuw bestand)**

Volg de structuur die `docs/PLAN_AI_VERDEELSLEUTEL_EN_PV.md` onder "Stap 1 — AI-suggestie verdeelsleutel" beschrijft:

- Types `AllocationSuggestionInput` en `AllocationSuggestion` zoals in het plan.
- Een functie die de Gemini-call doet (analoog aan `generateAiReportDraft` in `ai-report.ts`, maar met de Gemini-aanroepvorm): systeeminstructie dat het model een percentageverdeling voorstelt op basis van de aangeleverde offerte-/opdrachtbrieftekst en vergelijkbare contracten, géén uren of bedragen berekent, en dat percentages optellen tot 100.
- Na de call: valideer en corrigeer in code dat de teruggekregen percentages binnen afrondingstolerantie op 100 sommeren. Hergebruik of spiegel de normalisatielogica van `normalizePercentages` in `lib/domain/simulation.ts` — vertrouw de AI-output hier niet blind.
- Gooi een duidelijke fout als `GEMINI_API_KEY` ontbreekt, net zoals `generateAiReportDraft` doet voor `OPENAI_API_KEY`.

**2. Schema-uitbreiding (uit Stap 0, enkel het deel nodig voor Stap 1)**

Uit het volledige Stap 0 in het plan heb je voor deze opdracht alleen nodig: een manier om het AI-voorstel te bewaren voor traceerbaarheid. Voeg een Prisma-model `AllocationSuggestion` toe zoals in het plan beschreven: `id`, `contractId`, `sourceText`, `suggestedJson`, `model`, `createdAt`, `acceptedAt DateTime?`. Maak de migratie aan (`npx prisma migrate dev --name allocation_suggestion`). Voer de overige Stap 0-velden (tarieven, btw, facturatievelden) **niet** uit — die zijn voor de PV-functionaliteit (Stap 2) en horen niet in deze opdracht.

**3. Server action in `app/actions.ts`**

Nieuwe action `suggestAllocation(formData)`:
- Input: `contractId`, `sourceText` (vrije tekst — geplakte offerte/opdrachtbrief-inhoud of beschrijving).
- Haalt `knownProfiles` op (actieve `ProfileCategory`-records) en `comparableContracts` (andere actieve contracten met hun `ContractAllocationTemplate`-percentages, zoals het plan beschrijft) op via Prisma.
- Roept de nieuwe Gemini-functie aan, slaat het resultaat op in `AllocationSuggestion` (status: voorgesteld, nog niet geaccepteerd), en geeft het voorstel terug aan de pagina zonder het al te gebruiken in een simulatie.
- Bij fouten (ontbrekende key, API-fout, parsing-fout): vang dit af en toon een duidelijke Nederlandstalige foutmelding in de UI, naar het patroon van de bestaande `try/catch` in `generateReportAiDraft`.

Nieuwe action `acceptAllocationSuggestion(formData)`:
- Markeert de `AllocationSuggestion` als geaccepteerd (`acceptedAt`).
- Geeft de percentages door zodat ze als `AllocationInput[]` kunnen dienen voor `createSimulationProposal`, als alternatief voor de standaard `ContractAllocationTemplate`-percentages in de bestaande `createSimulation`-action. Pas `createSimulation` aan zodat het optioneel een expliciete set percentages accepteert (bijvoorbeeld via een verborgen formveld met de geaccepteerde suggestie-id of de percentages zelf) in plaats van altijd de contract-template te gebruiken. Wijzig `createSimulationProposal` in `lib/domain/simulation.ts` zelf niet — die ontvangt gewoon een andere bron voor `targetPercentage`, exact zoals het plan voorschrijft.

**4. UI in `app/simulations/page.tsx`**

Voeg een sectie "AI-voorstel verdeelsleutel" toe boven of naast het bestaande "Nieuwe simulatie"-formulier:
- Een `<textarea>` voor `sourceText` en een contractkeuze, met een submit-knop "Voorstel genereren" die `suggestAllocation` aanroept.
- Resultaatweergave: per profiel de voorgestelde percentage (bewerkbaar inputveld, vooringevuld) plus de motivatie (`rationale`) als kleine tekst ernaast, en de `overallRationale` erboven.
- Een knop "Gebruiken voor simulatie" die de (eventueel door de gebruiker aangepaste) percentages doorstuurt naar het bestaande simulatieformulier/`createSimulation`-flow in plaats van de standaard contractsleutel.
- Houd de bestaande "Nieuwe simulatie met standaardverdeelsleutel"-flow volledig intact als alternatief — dit is een aanvulling, geen vervanging.

### Niet doen

- Geen wijzigingen aan `lib/domain/ai-report.ts` of de OpenAI-integratie.
- Geen implementatie van de PV-docx-generatie (Stap 2 uit het plan) — dat is een latere opdracht.
- Geen tarieven-, btw- of facturatievelden toevoegen aan `Contract` — die horen bij Stap 2.
- Laat `createSimulationProposal` zelf geen AI-aanroepen doen of cijfers van AI overnemen — alleen percentages als input, de uren-berekening blijft 100% in `lib/domain`.

### Afronding

- Werk `docs/NEXT_STEPS_PLAN.md` of `docs/PLAN_AI_VERDEELSLEUTEL_EN_PV.md` bij met een korte statusnotitie ("Stap 1 geïmplementeerd: ...") zodat een volgende sessie weet wat al klaar is, in lijn met de regel "Elke sprint eindigt met bijgewerkte README of docs als gedrag verandert" uit `NEXT_STEPS_PLAN.md`.
- Test minstens handmatig: een simulatie aanmaken via het AI-voorstel, controleren dat de percentages optellen tot 100 en dat de resulterende uren-verdeling klopt met de bestaande `createSimulationProposal`-logica.
