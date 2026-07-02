#!/bin/bash
# Dubbelklik dit bestand (of run het in een terminal) om de lokale PostgreSQL-database
# te starten en alle Prisma-migraties toe te passen.
cd "$(dirname "$0")"
echo "=== Uren-dashboard: database migreren ==="
echo ""
echo "Stop eerst de dev-server (Ctrl+C in het venster waar 'npm run dev' draait)."
echo "Druk daarna Enter om door te gaan..."
read -r _
echo ""
echo ">> docker compose up -d db (start de lokale PostgreSQL-database)"
docker compose up -d db
echo ""
echo ">> prisma migrate deploy (past alle migraties toe en regenereert de Prisma-client)"
npx prisma migrate deploy
npx prisma generate
echo ""
echo "Klaar. Start de app weer met:  npm run dev"
read -p "Druk Enter om dit venster te sluiten..." _
