# Uren Dashboard

Demo-ready interne SaaS-tool voor urenregistratie, contractbudgetten, profielverdelingen en simulaties.

## Stack

- Next.js App Router, TypeScript en Tailwind
- Prisma met SQLite voor lokale demo
- Recharts voor grafieken
- Server actions voor mutaties
- CSV/XLSX import via `/api/import`
- OpenAI Responses API voor AI-conceptteksten in PV/rapporten

## Runnen

```bash
npm install
npm run db:push
npm run db:seed
npm run dev
```

Als `prisma db push` op Windows geen schema-engine output geeft, gebruik de lokale fallback:

```bash
npm run db:init
npm run db:seed
```

Open daarna `http://localhost:3000`.

## AI document assistant

De simulatie- en rapportpagina's kunnen AI-tekst genereren via Google Gemini: een voorstel voor de verdeelsleutel (percentages per profiel) en de concepttekst voor een PV. Voeg hiervoor lokaal een API-key toe:

```bash
GEMINI_API_KEY="..."
GEMINI_MODEL="gemini-2.5-flash"
```

De AI genereert alleen tekst. Cijfers, budgetten, profielafwijkingen, uren, dagen en bedragen komen uit de bestaande businesslogica (`lib/domain`) en worden nooit door de AI berekend.

## Data importeren

Gebruik `scripts/demo-import-template.csv` als template. De import ondersteunt CSV en XLSX en werkt in drie stappen:

1. Upload een bestand en maak een preview.
2. Controleer of de kolommen correct gekoppeld zijn.
3. Bevestig alleen de geldige rijen.

Verwachte standaardkolommen:

```text
employee,date,hours,task,contract,profile,notes
```

De app valideert import tegen bestaande stamdata. Contract is de contractcode, task is de taaknaam binnen dat contract, profile moet overeenkomen met het profiel van de medewerker. Foute rijen tonen rij, veld en reden. Geldige rijen kunnen alsnog geïmporteerd worden terwijl foute of dubbele rijen worden overgeslagen.

## Waar zitten de business rules?

- `lib/domain/calculations.ts`: halve/volle dag, budgetstatus, profielafwijkingen en contracttotalen
- `lib/domain/dashboard-alerts.ts`: actiegerichte dashboardalerts voor budget, profielmix, stale contracten en taakconcentratie
- `lib/domain/simulation.ts`: voorstelengine en afrondingscorrectie
- `lib/domain/import.ts`: import-parsing en rijvalidatie
- `prisma/schema.prisma`: relationeel datamodel en constraints

## Uitbreiden

- Nieuwe contracten, taken, profielen, medewerkers en verdeelsleutels kunnen via de beheerpagina worden toegevoegd en aangepast.
- Stamdata die al gebruikt wordt, wordt gedeactiveerd in plaats van verwijderd zodat historische time entries intact blijven.
- Verdeelsleutels per contract worden gevalideerd op exact 100%.
- SQLite is gekozen voor demosnelheid. Voor PostgreSQL: wijzig de Prisma datasource provider en `DATABASE_URL`, daarna migreren.
- PV-output is printvriendelijk en kan via browser naar PDF. Een echte binary PDF-generator is een logische vervolgstap.

## Volgende iteraties

- Volledige beheer-CRUD met validaties per stamdatamodel
- Kolommapping en preview voor import
- Actiegerichte dashboardalerts met links naar opvolging
- Auth met organisatieaccounts
- Auditlog op wijzigingen in uren en verdeelsleutels
- Geplande-vs-werkelijke trends per maand

## GitHub werkwijze

Gebruik [docs/GITHUB_WORKFLOW.md](docs/GITHUB_WORKFLOW.md) voor de vaste structuur om wijzigingen te controleren, committen en pushen.

## Roadmap

Gebruik [docs/NEXT_STEPS_PLAN.md](docs/NEXT_STEPS_PLAN.md) als roadmap voor de volgende productstappen.
