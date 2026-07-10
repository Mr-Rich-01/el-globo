import { defineConfig, env } from 'prisma/config'
import { config } from 'dotenv'

// Load .env explicitly
config()

// Prisma 7 config — env() lê automaticamente o .env para o CLI
// O adapter (PrismaPg) é passado ao PrismaClient em src/lib/prisma.ts
export default defineConfig({
  schema: './prisma/schema.prisma',
  migrations: {
    seed: 'npx tsx prisma/seed.ts',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
})



