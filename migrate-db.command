#!/bin/bash
# Dubbelklik dit bestand (of run het in een terminal) om de lokale SQLite-database
# bij te werken na een schemawijziging: schema toepassen (db push) en demodata seeden.
# Overstappen op PostgreSQL? Zie docs/POSTGRES_MIGRATIE.md.
cd "$(dirname "$0")"
echo "=== Uren-dashboard: database bijwerken ==="
echo ""
echo "Stop eerst de dev-server (Ctrl+C in het venster waar 'npm run dev' draait)."
echo "Druk daarna Enter om door te gaan..."
read -r _
echo ""
echo ">> prisma db push (past het schema toe op prisma/dev.db en regenereert de Prisma-client)"
npx prisma db push
echo ""
echo ">> prisma db seed (vult de demodata)"
npx prisma db seed
echo ""
echo "Klaar. Start de app weer met:  npm run dev"
read -p "Druk Enter om dit venster te sluiten..." _
