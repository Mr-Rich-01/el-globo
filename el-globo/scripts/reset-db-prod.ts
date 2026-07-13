/**
 * ============================================================
 * EL GLOBO — Reset de dados para Go-Live
 * ============================================================
 *
 * Limpa TODAS as tabelas transacionais (vendas, faturas, pedidos,
 * movimentos de stock, abas, quebras e sessões de caixa) e coloca
 * o stock de cada canal a ZERO, mantendo intacta a estrutura:
 * utilizadores, produtos, categorias, fichas técnicas, mesas e as
 * linhas de preço por canal (StockCanal — os preços ficam, o stock
 * atual é reposto a 0).
 *
 * Objetivo: entregar o sistema ao cliente com faturação e stock a
 * começar do zero, sem apagar o catálogo nem as contas.
 *
 * ⚠️ DESTRUTIVO E IRREVERSÍVEL. Uso manual, nunca em CI/automático.
 *   Execução:  npx tsx scripts/reset-db-prod.ts --sim
 *   (o argumento --sim é uma trava de segurança obrigatória)
 * ============================================================
 */

import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
  // Trava de segurança: só corre com a flag explícita.
  if (!process.argv.includes('--sim')) {
    console.error('❌ Trava de segurança ativa.')
    console.error('   Este script APAGA todos os dados transacionais e zera o stock.')
    console.error('   Para confirmar, execute:  npx tsx scripts/reset-db-prod.ts --sim')
    process.exit(1)
  }

  console.log('🧹 A preparar o sistema para Go-Live...')
  console.log('   Estrutura mantida: Utilizadores, Produtos, Categorias, Fichas Técnicas, Mesas.')
  console.log('')

  // A ordem respeita as foreign keys:
  //  - movimentos/quebras/caixa não têm dependentes → primeiro
  //  - itens de pedido/venda antes dos respetivos cabeçalhos
  //  - pedidos antes de vendas (Pedido.vendaId → Venda)
  //  - pedidos e vendas antes de abas (referenciam Aba)
  const resultado = await prisma.$transaction([
    prisma.movimentacaoStock.deleteMany({}),
    prisma.quebra.deleteMany({}),
    prisma.sessaoCaixa.deleteMany({}),
    prisma.itemPedido.deleteMany({}),
    prisma.pedido.deleteMany({}),
    prisma.itemVenda.deleteMany({}),
    prisma.venda.deleteMany({}),
    prisma.aba.deleteMany({}),
    // Stock de todos os canais a zero (preços/mínimos preservados)
    prisma.stockCanal.updateMany({ data: { stockAtual: 0 } }),
    // Todas as mesas de volta a LIVRE
    prisma.mesa.updateMany({ data: { estado: 'LIVRE' } }),
  ])

  const [
    movimentos, quebras, caixas, itensPedido, pedidos,
    itensVenda, vendas, abas, stockZerado, mesasLivres,
  ] = resultado

  console.log('✅ Limpeza concluída:')
  console.log(`   • Movimentações de stock apagadas: ${movimentos.count}`)
  console.log(`   • Quebras apagadas:                ${quebras.count}`)
  console.log(`   • Sessões de caixa apagadas:       ${caixas.count}`)
  console.log(`   • Itens de pedido apagados:        ${itensPedido.count}`)
  console.log(`   • Pedidos apagados:                ${pedidos.count}`)
  console.log(`   • Itens de venda apagados:         ${itensVenda.count}`)
  console.log(`   • Vendas/Faturas apagadas:         ${vendas.count}`)
  console.log(`   • Abas de piscina apagadas:        ${abas.count}`)
  console.log(`   • Linhas de stock zeradas:         ${stockZerado.count}`)
  console.log(`   • Mesas repostas a LIVRE:          ${mesasLivres.count}`)
  console.log('')
  console.log('🎉 Sistema pronto para entrega — faturação e stock a zero.')
  console.log('   Próximo passo: registar as entradas de stock reais do cliente.')
}

main()
  .catch((e) => {
    console.error('❌ Erro no reset:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
    await pool.end()
  })
