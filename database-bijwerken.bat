@echo off
REM ============================================================
REM  Werkt de database/Prisma-client bij na een schemawijziging.
REM  Nodig na het toevoegen van het 'Document'-model (documentenbibliotheek).
REM  Dubbelklik dit bestand of draai het in de projectmap.
REM ============================================================
cd /d "%~dp0"

echo.
echo === Prisma-client genereren (leert het nieuwe Document-model) ===
call npx prisma generate

echo.
echo === Database-tabel aanmaken/bijwerken ===
call npx prisma db push

echo.
echo === Klaar. Stop nu 'npm run dev' (Ctrl+C) en start het opnieuw. ===
echo Daarna werkt de pagina Beheer met de documentenbibliotheek.
pause
