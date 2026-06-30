@echo off
REM ============================================================
REM  Uren Dashboard: database bijwerken + commit en push.
REM  Dubbelklik dit bestand, of draai het in de projectmap.
REM ============================================================
cd /d "%~dp0"

echo.
echo === STAP 1: Database bijwerken voor de nieuwe documenten-functie ===
echo (Vereist: er is een nieuw 'Document'-model toegevoegd aan de database.)
call npx prisma generate
call npx prisma db push

echo.
echo === Vastgelopen git-lock verwijderen (indien aanwezig) ===
if exist ".git\index.lock" del ".git\index.lock"

echo.
echo === Git-index herstellen (lost 'unknown index entry format' op; raakt je bestanden NIET) ===
if exist ".git\index" del ".git\index"
git reset

echo.
echo === Wijzigingen toevoegen ===
git add -A

echo.
echo === Status ===
git status

echo.
echo === Committen ===
git commit -m "Beheer: inactief contract kan met een knop opnieuw geactiveerd worden"

echo.
echo === Pushen naar GitHub (origin/main) ===
git push origin main

echo.
echo === Klaar. Controleer hierboven of er fouten staan, en herstart daarna 'npm run dev'. ===
pause
