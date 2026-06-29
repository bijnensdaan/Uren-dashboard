#!/bin/bash
# Dubbelklik dit bestand (of run het in een terminal) om de database + Prisma-client
# bij te werken met de nieuwe tracker-velden (clockIn / clockOut / pauseMinutes).
cd "$(dirname "$0")"
echo "=== Uren-dashboard: database migreren ==="
echo ""
echo "Stop eerst de dev-server (Ctrl+C in het venster waar 'npm run dev' draait)."
echo "Druk daarna Enter om door te gaan..."
read -r _
echo ""
echo ">> prisma db push (voegt kolommen toe en regenereert de Prisma-client)"
npx prisma db push
echo ""
echo "Klaar. Start de app weer met:  npm run dev"
read -p "Druk Enter om dit venster te sluiten..." _
