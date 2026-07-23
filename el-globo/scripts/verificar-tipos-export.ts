/**
 * Verifica os TIPOS de célula do .xlsx de exportação de produtos.
 * Reabre o buffer gerado e confirma que:
 *   - preços/stock são NÚMERO (ValueType.Number) — somáveis, sem o
 *     triângulo verde de "número guardado como texto";
 *   - sku/codigo_barras são STRING com numFmt '@' — EAN-13 legível, sem
 *     apóstrofo e sem notação científica;
 *   - preco_custo ausente é célula VAZIA (Null), não 0.
 *
 *   Execução:  npx tsx scripts/verificar-tipos-export.ts
 */

import ExcelJS from 'exceljs'
import { construirWorkbookExport, type LinhaExport } from '../src/lib/produtos/export-produtos'

const AMOSTRA: LinhaExport[] = [
  {
    nome: 'Cerveja Dos M 330ml', sku: 'CERV-2M-330', codigoBarras: '6291041500213',
    grupo: 'Bebidas Alcoólicas', subcategoria: 'Cervejas', descricao: null,
    unidade: 'UNIDADE', canal: 'RESTAURANTE',
    precoVenda: 150, precoCusto: 80, stockInicial: 48, stockMinimo: 12,
    isIngrediente: false, ativo: true,
  },
  {
    // preco_custo ausente + stock com casas decimais
    nome: 'Sumo Natural de Maracujá 300ml', sku: 'SUMO-MARA-300', codigoBarras: null,
    grupo: 'Bebidas Não Alcoólicas', subcategoria: 'Sumos', descricao: 'Feito na hora',
    unidade: 'UNIDADE', canal: 'RESTAURANTE',
    precoVenda: 180, precoCusto: null, stockInicial: 12.5, stockMinimo: 0,
    isIngrediente: false, ativo: true,
  },
  {
    // Produto sem linha de canal → tudo vazio
    nome: 'Produto Orfão', sku: 'ORF-001', codigoBarras: null,
    grupo: 'Comida', subcategoria: '', descricao: null,
    unidade: 'PORCAO', canal: '',
    precoVenda: null, precoCusto: null, stockInicial: null, stockMinimo: null,
    isIngrediente: false, ativo: false,
  },
]

const COLS = {
  nome: 1, sku: 2, codigo_barras: 3, grupo: 4, subcategoria: 5, descricao: 6,
  unidade: 7, canal: 8, preco_venda: 9, preco_custo: 10, stock_inicial: 11,
  stock_minimo: 12, ingrediente: 13, ativo: 14,
} as const

async function main() {
  const wb = construirWorkbookExport(AMOSTRA)
  const buffer = await wb.xlsx.writeBuffer()

  // Reabre a partir do buffer (o que o Excel/importador vê).
  const lido = new ExcelJS.Workbook()
  await lido.xlsx.load(buffer as ArrayBuffer)
  const ws = lido.getWorksheet('Produtos')!

  let falhas = 0
  const check = (cond: boolean, msg: string) => {
    if (cond) console.log('ok:', msg)
    else { falhas++; console.error('FALHOU:', msg) }
  }

  const cell = (linha: number, col: number) => ws.getCell(linha, col)
  const T = ExcelJS.ValueType

  // Cabeçalho congelado + autoFilter
  check(ws.views?.[0]?.state === 'frozen' && ws.views?.[0]?.ySplit === 1, 'linha 1 congelada')
  check(!!ws.autoFilter, 'autoFilter presente')

  // Linha 2 (Cerveja): números reais + código de barras texto
  check(cell(2, COLS.preco_venda).type === T.Number, 'preco_venda é Number')
  check(cell(2, COLS.preco_custo).type === T.Number, 'preco_custo é Number')
  check(cell(2, COLS.stock_inicial).type === T.Number, 'stock_inicial é Number')
  check(cell(2, COLS.stock_minimo).type === T.Number, 'stock_minimo é Number')
  check(cell(2, COLS.codigo_barras).type === T.String, 'codigo_barras é String')
  check(cell(2, COLS.codigo_barras).value === '6291041500213', 'codigo_barras sem apóstrofo/notação científica')
  check(cell(2, COLS.codigo_barras).numFmt === '@', "codigo_barras com numFmt '@'")
  check(cell(2, COLS.sku).type === T.String && cell(2, COLS.sku).numFmt === '@', "sku String com numFmt '@'")
  check(cell(2, COLS.ingrediente).value === 'NÃO' && cell(2, COLS.ativo).value === 'SIM', 'booleanos como SIM/NÃO')

  // Linha 3 (Sumo): preco_custo ausente = célula vazia (não 0), stock decimal
  check(cell(3, COLS.preco_custo).type === T.Null, 'preco_custo ausente é célula vazia (não 0)')
  check(cell(3, COLS.stock_inicial).type === T.Number && cell(3, COLS.stock_inicial).value === 12.5, 'stock_inicial decimal preservado')

  // Linha 4 (órfão): sem canal, numéricos vazios
  check(cell(4, COLS.canal).type === T.Null || cell(4, COLS.canal).value === '' || cell(4, COLS.canal).value == null, 'canal vazio no produto sem linha')
  check(cell(4, COLS.preco_venda).type === T.Null, 'preco_venda vazio no produto sem canal')

  console.log(falhas === 0 ? '\n✅ TODOS OS TIPOS CORRECTOS' : `\n❌ ${falhas} verificação(ões) falhou(aram)`)
  process.exit(falhas === 0 ? 0 : 1)
}

main()
