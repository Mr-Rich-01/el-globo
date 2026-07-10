#!/bin/sh
set -e

echo "🔄 A aplicar migrações Prisma (migrate deploy — seguro, sem reset)..."
# Equivalente a `npx prisma migrate deploy`, mas invoca o CLI local
# diretamente — sem risco de o npx tentar descarregar da internet
node node_modules/prisma/build/index.js migrate deploy

echo "🚀 A iniciar o EL Globo (Next.js standalone)..."
exec node server.js
