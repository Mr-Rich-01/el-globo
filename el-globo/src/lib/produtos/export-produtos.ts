import ExcelJS from 'exceljs'
// Import relativo (sibling) — mantém o builder utilizável tanto na route
// Next (@/…) como num script tsx de verificação, que resolve caminhos
// relativos mas não o alias @/.
import { COLUNAS } from '../importacao-produtos'

// ============================================================
// Exportação de produtos para .xlsx.
// Mesmo layout de colunas do template de importação (COLUNAS) — o
// ficheiro exportado é re-importável sem edição.
//
// TIPOS DE CÉLULA (o ponto que uma implementação ingénua falha):
//  - sku / codigo_barras: STRING com numFmt '@' na coluna. Nunca
//    prefixados com apóstrofo (sujaria a reimportação). O '@' impede o
//    Excel de converter o EAN-13 para notação científica.
//  - preços/quantidades: NÚMERO real na célula (nunca a string "150,00").
//    Em locale pt-MZ o Excel mostra vírgula na mesma e o valor é somável.
//  - preco_custo ausente escreve célula vazia (null), nunca 0.
// A conversão Decimal → Number é feita pela route, só na montagem da
// linha; aqui não há aritmética sobre esses valores.
// ============================================================

const FMT_MOEDA = '#,##0.00'
const FMT_QTD = '#,##0.###'
const FMT_TEXTO = '@'

export interface LinhaExport {
  nome: string
  sku: string | null
  codigoBarras: string | null
  grupo: string
  subcategoria: string
  descricao: string | null
  unidade: string
  canal: string // '' quando o produto não tem linha de canal
  precoVenda: number | null
  precoCusto: number | null
  stockInicial: number | null // saldo actual (a coluna é de abertura na reimportação)
  stockMinimo: number | null
  isIngrediente: boolean
  ativo: boolean
}

// Shape mínimo que o mapeamento precisa. Os campos Decimal do Prisma
// entram como `unknown` — só se convertem a Number na montagem da célula.
export interface StockCanalExport {
  canal: string
  precoVenda: unknown
  precoCusto: unknown
  stockAtual: unknown
  stockMinimo: unknown
}
export interface ProdutoExport {
  nome: string
  sku: string | null
  codigoBarras: string | null
  descricao: string | null
  unidadeMedida: string
  isIngrediente: boolean
  ativo: boolean
  categoria: { nome: string; parentCategoryId: string | null; parent: { nome: string } | null }
  stockCanais: StockCanalExport[]
}

// Converte os produtos já filtrados (com categoria.parent e as linhas de
// stock dos canais acessíveis) nas linhas do ficheiro, ordenadas por
// grupo → subcategoria → nome (canal como desempate estável das linhas
// multi-canal). Um produto SEM linha de canal sai com `canal` vazio — não
// se omite. Partilhado pela route e pela verificação de aceitação.
export function montarLinhasExport(produtos: ProdutoExport[]): LinhaExport[] {
  const linhas: LinhaExport[] = []
  for (const p of produtos) {
    const temPai = p.categoria.parentCategoryId != null
    // grupo = categoria pai (ou a própria, se for grupo de topo);
    // subcategoria = a própria categoria quando tem pai.
    const grupo = temPai ? (p.categoria.parent?.nome ?? '') : p.categoria.nome
    const subcategoria = temPai ? p.categoria.nome : ''
    const base = {
      nome: p.nome,
      sku: p.sku,
      codigoBarras: p.codigoBarras,
      grupo,
      subcategoria,
      descricao: p.descricao,
      unidade: p.unidadeMedida,
      isIngrediente: p.isIngrediente,
      ativo: p.ativo,
    }

    if (p.stockCanais.length === 0) {
      linhas.push({ ...base, canal: '', precoVenda: null, precoCusto: null, stockInicial: null, stockMinimo: null })
      continue
    }

    for (const sc of p.stockCanais) {
      linhas.push({
        ...base,
        canal: sc.canal,
        // Decimal → Number só aqui, na montagem da célula; sem aritmética.
        precoVenda: Number(sc.precoVenda),
        precoCusto: sc.precoCusto != null ? Number(sc.precoCusto) : null,
        // A coluna stock_inicial carrega o SALDO ACTUAL; na reimportação é
        // ignorada para pares existentes (ver importacao-produtos.ts).
        stockInicial: Number(sc.stockAtual),
        stockMinimo: Number(sc.stockMinimo),
      })
    }
  }

  linhas.sort((a, b) =>
    a.grupo.localeCompare(b.grupo, 'pt') ||
    a.subcategoria.localeCompare(b.subcategoria, 'pt') ||
    a.nome.localeCompare(b.nome, 'pt') ||
    a.canal.localeCompare(b.canal, 'pt')
  )

  return linhas
}

export function construirWorkbookExport(linhas: LinhaExport[]): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'EL Globo'

  const ws = wb.addWorksheet('Produtos', { views: [{ state: 'frozen', ySplit: 1 }] })
  ws.columns = COLUNAS.map(c => ({ header: c.titulo, key: c.chave, width: c.largura }))

  // Formatos por coluna aplicados ANTES de escrever as linhas — as novas
  // células herdam o numFmt da coluna.
  ws.getColumn('sku').numFmt = FMT_TEXTO
  ws.getColumn('codigo_barras').numFmt = FMT_TEXTO
  ws.getColumn('preco_venda').numFmt = FMT_MOEDA
  ws.getColumn('preco_custo').numFmt = FMT_MOEDA
  ws.getColumn('stock_inicial').numFmt = FMT_QTD
  ws.getColumn('stock_minimo').numFmt = FMT_QTD

  const header = ws.getRow(1)
  header.font = { bold: true }
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEEEEE' } }

  for (const l of linhas) {
    ws.addRow({
      nome: l.nome,
      sku: l.sku ?? '',
      codigo_barras: l.codigoBarras ?? '',
      grupo: l.grupo,
      subcategoria: l.subcategoria,
      descricao: l.descricao ?? '',
      unidade: l.unidade,
      canal: l.canal,
      preco_venda: l.precoVenda,
      preco_custo: l.precoCusto, // null → célula vazia (não 0)
      stock_inicial: l.stockInicial,
      stock_minimo: l.stockMinimo,
      ingrediente: l.isIngrediente ? 'SIM' : 'NÃO',
      ativo: l.ativo ? 'SIM' : 'NÃO',
    })
  }

  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLUNAS.length } }

  return wb
}
