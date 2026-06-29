@echo off
REM ============================================================
REM  Commit en push de Uren Dashboard wijzigingen naar GitHub.
REM  Dubbelklik dit bestand, of draai het in de projectmap.
REM ============================================================
cd /d "%~dp0"

echo.
echo === Vastgelopen git-lock verwijderen (indien aanwezig) ===
if exist ".git\index.lock" del ".git\index.lock"

echo.
echo === Wijzigingen toevoegen ===
git add -A

echo.
echo === Committen ===
git commit -m "Redesign Planning en Beheer voor niet-technische gebruikers; fix build error op Beheer"

echo.
echo === Pushen naar GitHub (origin/main) ===
git push origin main

echo.
echo === Klaar. Controleer hierboven of er fouten staan. ===
pause
