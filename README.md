# Uren Dashboard

Demo-ready interne SaaS-tool voor urenregistratie, contractbudgetten, profielverdelingen en simulaties.

## Stack

- Next.js App Router, TypeScript en Tailwind
- Prisma met SQLite voor lokale demo
- Recharts voor grafieken
- Server actions voor mutaties
- CSV/XLSX import via `/api/import`

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

## Data importeren

Gebruik `scripts/demo-import-template.csv` als template. Verwachte kolommen:

```text
employee,date,hours,task,contract,profile,notes
```

De MVP valideert import tegen bestaande stamdata. Contract is de contractcode, task is de taaknaam binnen dat contract, profile moet overeenkomen met het profiel van de medewerker.

## Waar zitten de business rules?

- `lib/domain/calculations.ts`: halve/volle dag, budgetstatus, profielafwijkingen en contracttotalen
- `lib/domain/simulation.ts`: voorstelengine en afrondingscorrectie
- `lib/domain/import.ts`: import-parsing en rijvalidatie
- `prisma/schema.prisma`: relationeel datamodel en constraints

## Uitbreiden

- Nieuwe contracten, taken, profielen en medewerkers zitten in Prisma en kunnen later via beheer-CRUD worden uitgebreid.
- SQLite is gekozen voor demosnelheid. Voor PostgreSQL: wijzig de Prisma datasource provider en `DATABASE_URL`, daarna migreren.
- PV-output is printvriendelijk en kan via browser naar PDF. Een echte binary PDF-generator is een logische vervolgstap.

## Volgende iteraties

- Volledige beheer-CRUD met validaties per stamdatamodel
- Kolommapping en preview voor import
- Auth met organisatieaccounts
- Auditlog op wijzigingen in uren en verdeelsleutels
- Geplande-vs-werkelijke trends per maand

## GitHub werkwijze

Gebruik [docs/GITHUB_WORKFLOW.md](docs/GITHUB_WORKFLOW.md) voor de vaste structuur om wijzigingen te controleren, committen en pushen.
