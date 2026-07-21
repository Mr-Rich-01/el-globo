/**
 * Gera a cópia estática do template de importação de produtos em
 * docs/templates/importacao-produtos.xlsx.
 *
 * A fonte de verdade é o GET /api/produtos/importar/template (gerado na
 * hora com as categorias da BD); esta cópia serve para documentação e
 * para preencher offline. Usa as categorias da BD local se estiver
 * acessível; senão, a lista do seed.
 *
 *   Execução:  npx tsx scripts/gerar-template-importacao.ts
 */

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs'
import path from 'path'
import { construirTemplate, type CategoriaTemplate } from '../src/lib/importacao-produtos'

// Espelho das categorias do prisma/seed.ts (fallback sem BD)
const CATEGORIAS_SEED: CategoriaTemplate[] = [
  { nome: 'Bebidas Alcoólicas', parentNome: null },
  { nome: 'Cervejas', parentNome: 'Bebidas Alcoólicas' },
  { nome: 'Vinhos', parentNome: 'Bebidas Alcoólicas' },
  { nome: 'Whiskies', parentNome: 'Bebidas Alcoólicas' },
  { nome: 'Bebidas Não Alcoólicas', parentNome: null },
  { nome: 'Sumos', parentNome: 'Bebidas Não Alcoólicas' },
  { nome: 'Refrescos', parentNome: 'Bebidas Não Alcoólicas' },
  { nome: 'Comida', parentNome: null },
  { nome: 'Entradas', parentNome: 'Comida' },
  { nome: 'Pratos Principais', parentNome: 'Comida' },
  { nome: 'Aperitivos', parentNome: 'Comida' },
  { nome: 'Snacks', parentNome: null },
]

function carregarEnv() {
  const envPath = path.join(__dirname, '..', '.env')
  if (!process.env.DATABASE_URL && existsSync(envPath)) {
    for (const linha of readFileSync(envPath, 'utf8').split('\n')) {
      const m = linha.match(/^\s*DATABASE_URL\s*=\s*"?([^"\r]+)"?\s*$/)
      if (m) process.env.DATABASE_URL = m[1]
    }
  }
}

async function categoriasDaBD(): Promise<CategoriaTemplate[] | null> {
  try {
    const { PrismaClient } = await import('@prisma/client')
    const { PrismaPg } = await import('@prisma/adapter-pg')
    const { Pool } = await import('pg')
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 3000 })
    const prisma = new PrismaClient({ adapter: new PrismaPg(pool) })
    const cats = await prisma.categoria.findMany({
      where: { ativo: true },
      select: { nome: true, parent: { select: { nome: true } } },
      orderBy: [{ ordem: 'asc' }, { nome: 'asc' }],
    })
    await prisma.$disconnect()
    return cats.length > 0 ? cats.map(c => ({ nome: c.nome, parentNome: c.parent?.nome ?? null })) : null
  } catch {
    return null
  }
}

async function main() {
  carregarEnv()
  const daBD = await categoriasDaBD()
  const categorias = daBD ?? CATEGORIAS_SEED
  console.log(daBD ? `Categorias da BD (${categorias.length})` : 'BD indisponível — a usar categorias do seed')

  const wb = construirTemplate(categorias)
  const buffer = await wb.xlsx.writeBuffer()

  const destino = path.join(__dirname, '..', 'docs', 'templates', 'importacao-produtos.xlsx')
  mkdirSync(path.dirname(destino), { recursive: true })
  writeFileSync(destino, Buffer.from(buffer))
  console.log(`Template escrito em ${destino}`)
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
