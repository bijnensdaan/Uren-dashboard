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
git commit -m "AI-planning: lees .docx-opdrachtbrieven uit + duidelijke planning per fase; verdeelsleutel op Simulatie, fasering op Planning"

echo.
echo === Pushen naar GitHub (origin/main) ===
git push origin main

echo.
echo === Klaar. Controleer hierboven of er fouten staan. ===
pause
