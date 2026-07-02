@echo off
REM ============================================================
REM  Werkt de lokale PostgreSQL-database bij na een schemawijziging.
REM  Start de database via Docker en past alle Prisma-migraties toe.
REM  Dubbelklik dit bestand of draai het in de projectmap.
REM ============================================================
cd /d "%~dp0"

echo.
echo === Database starten via Docker (docker compose up -d db) ===
docker compose up -d db

echo.
echo === Prisma-migraties toepassen (prisma migrate deploy) ===
call npx prisma migrate deploy

echo.
echo === Prisma-client genereren ===
call npx prisma generate

echo.
echo === Klaar. Stop nu 'npm run dev' (Ctrl+C) en start het opnieuw. ===
pause
