# Uren Dashboard

Demo-ready interne SaaS-tool voor urenregistratie, contractbudgetten, profielverdelingen en simulaties.

## Stack

- Next.js App Router, TypeScript en Tailwind
- Prisma met PostgreSQL (lokaal via docker-compose)
- Recharts voor grafieken
- Server actions voor mutaties
- CSV/XLSX import via `/api/import`
- Google Gemini API voor AI-conceptteksten (verdeelsleutel en PV)

## Runnen

```bash
npm install
cp .env.example .env   # Windows: copy .env.example .env
docker compose up -d db
npm run db:migrate
npm run db:seed
npm run dev
```

De database is PostgreSQL en draait lokaal via `docker compose up -d db` (zie `docker-compose.yml`). Schemawijzigingen gaan via Prisma-migraties: `npm run db:migrate` (ontwikkeling), `npm run db:deploy` (alleen bestaande migraties toepassen) en `npm run db:reset` (database leegmaken, migraties opnieuw draaien en automatisch seeden).

Het `.env`-bestand staat bewust in `.gitignore` en zit dus **niet** in een GitHub-clone. Maak het altijd lokaal aan op basis van `.env.example`, anders krijg je `Environment variable not found: DATABASE_URL`. De AI-functies hebben daarnaast een geldige `GEMINI_API_KEY` nodig; zonder die key werkt het dashboard verder gewoon, alleen de AI-knoppen niet.

Open daarna `http://localhost:3000`.

## AI document assistant

Het dashboard kan een offerte of opdrachtbrief als PDF/DOCX uploaden en via Google Gemini laten uitlezen. Gemini vult conceptueel de PV-stamdata en verdeelsleutel voor; de gebruiker controleert en bevestigt dit in de simulatietool. Tekst plakken blijft beschikbaar als fallback, en de rapportpagina kan daarna AI-concepttekst voor een PV genereren. Voeg hiervoor lokaal een API-key toe:

```bash
GEMINI_API_KEY="..."
GEMINI_MODEL="gemini-2.5-flash"
```

De AI genereert alleen tekst. Cijfers, budgetten, profielafwijkingen, uren, dagen en bedragen komen uit de bestaande businesslogica (`lib/domain`) en worden nooit door de AI berekend.

## Planning

De pagina **Planning** maakt een geautomatiseerde weekplanning per medewerker over de volledige looptijd van een contract. Je kiest een contract en uploadt optioneel de opdrachtbrief; Gemini stelt de **fasering** voor (fases met periode en relatief gewicht). De engine in `lib/domain/planning.ts` berekent vervolgens deterministisch de uren per profiel per week (budget × verdeelsleutel × fasegewicht), verdeelt die over de medewerkers van elk profiel en markeert **overbelasting** wanneer een medewerker boven zijn weekcapaciteit (`Employee.weeklyCapacityHours`, instelbaar in Beheer) uitkomt. **Belgische wettelijke feestdagen** (vast + paasgebonden, berekend in `lib/domain/holidays.ts`) worden meegenomen in de weekverdeling: weken met feestdagen op ma&ndash;vr tellen minder werkdagen en krijgen proportioneel minder uren, terwijl het totale budget exact behouden blijft. Fases en toewijzing (gewicht/capaciteit per medewerker) zijn bewerkbaar; het resultaat is exporteerbaar als Excel (`/api/planning/[id]/xlsx`). Net als elders levert Gemini enkel de fasering; alle uren/dagen blijven deterministisch.

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
- PostgreSQL is de standaarddatabase (lokaal via docker-compose, zie "Runnen"). De oude SQLite-database (`prisma/dev.db`) is alleen nog historisch en wordt niet meer gebruikt.
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
