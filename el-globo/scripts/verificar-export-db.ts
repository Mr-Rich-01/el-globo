/**
 * Verifica, contra a BD real, os dois critérios de aceitação da exportação
 * de produtos que mais facilmente regridem em silêncio (uma alteração ao
 * `include` do Prisma na exportação faria o produto órfão desaparecer do
 * ficheiro sem partir nenhum teste de tipos):
 *
 *   4. Produto SEM linha `StockCanal` sai na exportação com a coluna `canal`
 *      vazia — não é omitido.
 *   6. Filtrar por canal → o ficheiro contém apenas esse canal.
 *
 * Exercita o MESMO caminho da route (`construirWhereProdutos` +
 * `resolverCanalFiltro` + `montarLinhasExport`). Todas as fixtures são
 * criadas e consultadas dentro de UMA transação com rollback deliberado no
 * fim — não deixa resíduo na BD, mesmo que falhe a meio.
 *
 *   Execução:  npx tsx scripts/verificar-export-db.ts
 */

import { config } from 'dotenv'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import ExcelJS from 'exceljs'
import { construirWhereProdutos, resolverCanalFiltro } from '../src/lib/produtos/filtros'
import { montarLinhasExport, construirWorkbookExport, type ProdutoExport } from '../src/lib/produtos/export-produtos'

config()

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) })

const TODOS = ['RESTAURANTE', 'BOTTLESTORE', 'PISCINA'] as const
const SKU_ORFAO = 'ZZTEST-EXPORT-ORFAO'
const SKU_MULTI = 'ZZTEST-EXPORT-MULTI'
const ROLLBACK = Symbol('rollback-deliberado')

// Cliente de transação do Prisma (o parâmetro do $transaction interativo).
type Tx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]

let falhas = 0
const check = (cond: boolean, msg: string) => {
  if (cond) console.log('ok:', msg)
  else { falhas++; console.error('FALHOU:', msg) }
}

// Espelha a query da route: where partilhado + stockCanais só dos canais alvo.
async function correrExport(tx: Tx, filtros: { q?: string; canal?: string; ativo?: string }) {
  const permitidos = [...TODOS]
  const canalAlvo = resolverCanalFiltro(filtros.canal, permitidos)
  const canaisAlvo = canalAlvo ? [canalAlvo] : permitidos
  const produtos = await tx.produto.findMany({
    where: construirWhereProdutos(filtros, permitidos),
    include: { categoria: { include: { parent: true } }, stockCanais: { where: { canal: { in: canaisAlvo } } } },
  })
  return montarLinhasExport(produtos as unknown as ProdutoExport[])
}

async function corpo(tx: Tx) {
  const grupo = await tx.categoria.findFirst({ where: { parentCategoryId: null } })
  if (!grupo) throw new Error('sem categoria de topo na BD para o teste')

  await tx.produto.create({
    data: { nome: 'TESTE Export Órfão', sku: SKU_ORFAO, categoriaId: grupo.id, unidadeMedida: 'UNIDADE' },
  })
  await tx.produto.create({
    data: {
      nome: 'TESTE Export Multi', sku: SKU_MULTI, categoriaId: grupo.id, unidadeMedida: 'UNIDADE',
      stockCanais: {
        create: [
          { canal: 'RESTAURANTE', precoVenda: '10.00', stockAtual: '5' },
          { canal: 'BOTTLESTORE', precoVenda: '20.00', stockAtual: '8' },
        ],
      },
    },
  })

  // ---- Critério 4: produto sem StockCanal sai com canal vazio ----
  const linhasA = await correrExport(tx, { ativo: 'true' })
  const doOrfao = linhasA.filter(l => l.sku === SKU_ORFAO)
  check(doOrfao.length === 1, `órfão sai em exactamente 1 linha (obtidas ${doOrfao.length})`)
  check(doOrfao[0]?.canal === '', `órfão tem coluna canal vazia (obtido "${doOrfao[0]?.canal}")`)
  // Confirma também no .xlsx materializado (célula vazia/Null, não omitida).
  const wb = construirWorkbookExport(linhasA)
  const lido = new ExcelJS.Workbook()
  await lido.xlsx.load((await wb.xlsx.writeBuffer()) as ArrayBuffer)
  const ws = lido.getWorksheet('Produtos')!
  let achouOrfao = false
  ws.eachRow((row, n) => {
    if (n === 1 || row.getCell(2).value !== SKU_ORFAO) return
    achouOrfao = true
    const canal = row.getCell(8).value
    check(canal == null || canal === '', 'no .xlsx, a célula canal do órfão está vazia')
  })
  check(achouOrfao, 'órfão presente no .xlsx (não omitido)')

  // ---- Critério 6: filtrar por canal → só esse canal no ficheiro ----
  const linhasB = await correrExport(tx, { canal: 'BOTTLESTORE', ativo: 'true' })
  const doMulti = linhasB.filter(l => l.sku === SKU_MULTI)
  check(doMulti.length === 1 && doMulti[0]?.canal === 'BOTTLESTORE', `multi-canal filtrado só devolve a linha BOTTLESTORE (obtidas ${doMulti.length})`)
  check(!linhasB.some(l => l.sku === SKU_ORFAO), 'órfão (sem BOTTLESTORE) é excluído quando se filtra por canal')
  const canais = new Set(linhasB.map(l => l.canal).filter(Boolean))
  check(canais.size === 0 || (canais.size === 1 && canais.has('BOTTLESTORE')),
    `TODAS as linhas com canal são BOTTLESTORE (canais no ficheiro: ${[...canais].join(', ') || 'nenhum'})`)
}

async function main() {
  try {
    await prisma.$transaction(async (tx) => {
      await corpo(tx)
      // Rollback deliberado: as fixtures nunca são gravadas.
      throw ROLLBACK
    }, { timeout: 30_000 })
  } catch (e) {
    if (e !== ROLLBACK) throw e
  }
  console.log(falhas === 0 ? '\n✅ CRITÉRIOS 4 e 6 CONFIRMADOS (fixtures revertidas, BD intacta)' : `\n❌ ${falhas} falha(s)`)
  process.exitCode = falhas === 0 ? 0 : 1
}

main()
  .catch(e => { console.error(e); process.exitCode = 1 })
  .finally(async () => { await prisma.$disconnect(); await pool.end() })
