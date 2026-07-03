# PostgreSQL-migratie (draaiboek)

Dit document beschrijft hoe je het Uren Dashboard omschakelt van SQLite
(`prisma/dev.db`, de huidige default) naar PostgreSQL — **zonder dat Docker
vereist is**. Alles is voorbereid; zolang je de stappen hieronder niet
uitvoert, blijft de app gewoon op SQLite draaien.

Wat er al klaarstaat:

| Onderdeel | Locatie |
| --- | --- |
| PostgreSQL-schema (kopie van het hoofdschema) | `prisma/postgres/schema.prisma` |
| Initiële migratie (alle 14 tabellen, indexes, FK's) | `prisma/postgres/migrations/00000000000000_init/migration.sql` |
| Data-export (SQLite → JSON) | `scripts/export-data.ts` (`npm run db:export`) |
| Data-import (JSON → PostgreSQL) | `scripts/import-data.ts` (`npm run db:import`) |
| Schema uitrollen op PostgreSQL | `npm run db:pg:deploy` |

> **Belangrijk (tot de omschakeling):** bij elke wijziging aan
> `prisma/schema.prisma` moet `prisma/postgres/schema.prisma` handmatig in
> sync gehouden worden, en moet de migratie opnieuw gegenereerd worden (zie
> "Schema in sync houden" onderaan). De zes JSON-velden (`aiInsightsJson`,
> `phasesJson`, `assignmentsJson`, `suggestedJson`, `pvNarrativeJson`,
> `pvDataJson`) blijven bewust `String` (geen Postgres `Json`-type) zodat de
> applicatiecode ongewijzigd blijft; omzetten naar `Json` is een mogelijke
> latere verbetering.

## Stap 1 — PostgreSQL-server regelen

Kies één van deze opties:

**Optie A: native Windows-installatie (geen Docker nodig)**

1. Download de installer van <https://www.postgresql.org/download/windows/>
   (EDB-installer, versie 16 of 17).
2. Doorloop de wizard: kies een wachtwoord voor de superuser `postgres`,
   laat de poort op `5432` staan. De onderdelen "PostgreSQL Server" en
   "Command Line Tools" zijn voldoende (pgAdmin is optioneel maar handig).
3. Na installatie draait PostgreSQL als Windows-service en start automatisch
   mee met Windows. De tools (`psql`, `pg_dump`) staan in
   `C:\Program Files\PostgreSQL\<versie>\bin` (voeg die map eventueel toe aan
   PATH).

**Optie B: door IT beheerde interne server**

Vraag bij IT een database aan op de interne PostgreSQL-server. Je hebt nodig:
hostnaam, poort (meestal 5432), databasenaam, gebruikersnaam en wachtwoord.
De gebruiker moet eigenaar van de database zijn (of minstens `CREATE`-rechten
op het `public`-schema hebben), zodat `prisma migrate deploy` tabellen kan
aanmaken. Stap 2 kun je dan overslaan.

**Optioneel alternatief: Docker**

Wie wél Docker heeft kan de meegeleverde `docker-compose.yml` gebruiken:
`docker compose up -d db` start een lokale PostgreSQL 17 op poort 5432
(user/wachtwoord/database: `postgres`/`postgres`/`uren_dashboard`). Stap 2
kan dan ook overgeslagen worden en de URL in stap 4 wordt
`postgresql://postgres:postgres@localhost:5432/uren_dashboard`.

## Stap 2 — Database en gebruiker aanmaken (alleen optie A)

Open een terminal en verbind als superuser (wachtwoord uit de installer):

```powershell
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres
```

Voer daarna uit (kies zelf een sterk wachtwoord):

```sql
CREATE USER uren_app WITH PASSWORD 'KIES_EEN_STERK_WACHTWOORD';
CREATE DATABASE uren_dashboard OWNER uren_app;
\q
```

## Stap 3 — Data veiligstellen (vóór de omschakeling!)

Draai dit terwijl de app nog op SQLite staat:

```bash
npm run db:export
```

Dit leest alle tabellen uit `prisma/dev.db` en schrijft
`prisma/postgres/data-export.json` (met tijdstempel en aantallen per tabel in
de metadata). Controleer in de console-output dat de aantallen kloppen. Het
bestand bevat bedrijfsgegevens en staat daarom in `.gitignore` — niet
committen of delen.

## Stap 4 — Omschakelen naar PostgreSQL

1. Zet in `prisma/schema.prisma` de provider om:

   ```prisma
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }
   ```

2. Pas `DATABASE_URL` in `.env` aan:

   ```bash
   DATABASE_URL="postgresql://uren_app:WACHTWOORD@localhost:5432/uren_dashboard"
   ```

   (Bij optie B: de host/poort/credentials van IT.)

3. Genereer de Prisma-client opnieuw:

   ```bash
   npx prisma generate
   ```

## Stap 5 — Schema aanmaken op de server

```bash
npm run db:pg:deploy
```

Dit draait `prisma migrate deploy` met `prisma/postgres/schema.prisma` en
past de initiële migratie toe: alle 14 tabellen, indexes en foreign keys.

## Stap 6 — Data terugzetten

```bash
npm run db:import
```

Dit leest `prisma/postgres/data-export.json` en vult de tabellen in
dependency-volgorde, met behoud van de originele id's. Het script weigert te
draaien als de doel-database niet leeg is.

Wil je liever met verse demodata beginnen in plaats van de bestaande data
over te zetten, draai dan `npm run db:seed` in plaats van `db:import`.

## Stap 7 — Verificatie

1. Start de app: `npm run dev` en open <http://localhost:3000>.
2. Controleer dat de contracten, uren en rapporten er staan en dat je een
   nieuwe tijdsregistratie kunt opslaan.
3. Snelle controle via de database zelf:

   ```powershell
   & "C:\Program Files\PostgreSQL\17\bin\psql.exe" -U uren_app -d uren_dashboard -c "SELECT count(*) FROM \"Contract\";"
   ```

4. Verwijder daarna `prisma/postgres/data-export.json` (bedrijfsgegevens).

### Rollback (terug naar SQLite)

Gaat er iets mis, dan is teruggaan simpel — de SQLite-database blijft
onaangeroerd staan:

1. Zet in `prisma/schema.prisma` de provider terug op `"sqlite"`.
2. Zet in `.env` terug: `DATABASE_URL="file:./dev.db"`.
3. Draai `npx prisma generate`.
4. `npm run dev` — de app draait weer op `prisma/dev.db`.

## Back-ups (na de omschakeling)

Maak periodiek een back-up met `pg_dump`:

```powershell
& "C:\Program Files\PostgreSQL\17\bin\pg_dump.exe" -U uren_app -d uren_dashboard -F c -f "uren_dashboard_$(Get-Date -Format yyyyMMdd).dump"
```

Terugzetten kan met `pg_restore -U uren_app -d uren_dashboard --clean <bestand>`.
Bij een door IT beheerde server: vraag na of back-ups daar al centraal
geregeld zijn.

## Schema in sync houden (tot de omschakeling)

Zolang de app nog op SQLite draait:

1. Wijzig `prisma/schema.prisma` zoals gewoonlijk en draai `npm run db:push`.
2. Voer **dezelfde** wijziging door in `prisma/postgres/schema.prisma`
   (alleen de provider verschilt).
3. Regenereer de initiële migratie (kan offline, geen database nodig):

   ```bash
   npx prisma migrate diff --from-empty --to-schema-datamodel prisma/postgres/schema.prisma --script > prisma/postgres/migrations/00000000000000_init/migration.sql
   ```

   Let op (PowerShell): `>` schrijft standaard UTF-16; gebruik daar
   `npx prisma migrate diff ... --script | Out-File -Encoding utf8 prisma/postgres/migrations/00000000000000_init/migration.sql`.

Zolang er nog niemand op PostgreSQL draait, mag de initiële migratie gewoon
overschreven worden. Ná de omschakeling gaan schemawijzigingen via echte
migraties (`prisma migrate dev`) en vervalt deze dubbele boekhouding: dan
wordt `prisma/schema.prisma` zelf postgres en kan `prisma/postgres/` worden
opgeruimd.

## Waarschuwingen

- Draai **nooit** `npx prisma generate --schema prisma/postgres/schema.prisma`
  zolang de app op SQLite draait: dat vervangt de gegenereerde client in
  `node_modules` door een postgres-client en breekt de draaiende app.
- `npm run db:import` pas draaien **na** stap 4 en 5 (dus tegen PostgreSQL).
- `prisma/postgres/data-export.json` nooit committen (staat in `.gitignore`).
