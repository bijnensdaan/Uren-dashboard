@echo off
REM ============================================================
REM  Werkt de lokale SQLite-database bij na een schemawijziging.
REM  Past het Prisma-schema toe (db push) en vult de demodata (seed).
REM  Dubbelklik dit bestand of draai het in de projectmap.
REM  Overstappen op PostgreSQL? Zie docs/POSTGRES_MIGRATIE.md.
REM ============================================================
cd /d "%~dp0"

echo.
echo === Schema toepassen op prisma/dev.db (prisma db push) ===
call npx prisma db push

echo.
echo === Demodata seeden (prisma db seed) ===
call npx prisma db seed

echo.
echo === Klaar. Stop nu 'npm run dev' (Ctrl+C) en start het opnieuw. ===
pause
