import ExcelJS from 'exceljs'
import { z } from 'zod'

// ============================================================
// Importação em massa de produtos via Excel.
// Layout: UMA LINHA POR PRODUTO+CANAL (espelha o StockCanal) —
// um produto vendido em 2 canais ocupa 2 linhas com o mesmo SKU.
// Dinheiro circula sempre como STRING decimal normalizada (nunca
// parseFloat de células "150,00") e entra no Prisma como Decimal.
// ============================================================

export const UNIDADES = ['UNIDADE', 'LITRO', 'MILILITRO', 'KG', 'GRAMA', 'PORCAO'] as const
export const CANAIS = ['RESTAURANTE', 'BOTTLESTORE', 'PISCINA'] as const

export const SHEET_PRODUTOS = 'Produtos'
export const SHEET_INSTRUCOES = 'Instruções'
export const SHEET_LISTAS = 'Listas'

// Nº de linhas com data validation (dropdowns) pré-aplicada no template
const LINHAS_COM_VALIDACAO = 501

interface ColunaDef {
  chave: string
  titulo: string
  largura: number
  obrigatorio: string
  descricao: string
}

export const COLUNAS: ColunaDef[] = [
  { chave: 'nome', titulo: 'nome', largura: 32, obrigatorio: 'Sim', descricao: 'Nome do produto como aparece no POS e no cardápio. Ex: "Cerveja Dos M 330ml".' },
  { chave: 'sku', titulo: 'sku', largura: 16, obrigatorio: 'Sim', descricao: 'Código único do produto — é a chave da importação: SKU novo cria produto, SKU existente atualiza. Para vender em 2 canais, repita o SKU em 2 linhas mudando só o canal.' },
  { chave: 'codigo_barras', titulo: 'codigo_barras', largura: 16, obrigatorio: 'Não', descricao: 'Código de barras (EAN). Único no sistema se preenchido.' },
  { chave: 'categoria', titulo: 'categoria', largura: 20, obrigatorio: 'Sim', descricao: 'Nome exato de uma categoria existente (dropdown — ver folha "Listas"). Categorias novas criam-se primeiro no sistema.' },
  { chave: 'descricao', titulo: 'descricao', largura: 28, obrigatorio: 'Não', descricao: 'Descrição para o cardápio digital.' },
  { chave: 'unidade', titulo: 'unidade', largura: 12, obrigatorio: 'Sim', descricao: 'Unidade de medida: UNIDADE (garrafas/latas), LITRO, MILILITRO, KG, GRAMA ou PORCAO (comida).' },
  { chave: 'canal', titulo: 'canal', largura: 14, obrigatorio: 'Sim', descricao: 'Onde o produto é vendido: RESTAURANTE, BOTTLESTORE ou PISCINA. A Piscina sem linha própria é servida pelo stock do Restaurante.' },
  { chave: 'preco_venda', titulo: 'preco_venda', largura: 12, obrigatorio: 'Sim', descricao: 'Preço de venda neste canal, em MT. Máx. 2 casas decimais. Use vírgula OU ponto decimal (150,00 ou 150.00) e SEM separador de milhares.' },
  { chave: 'preco_custo', titulo: 'preco_custo', largura: 12, obrigatorio: 'Não', descricao: 'Custo de compra em MT (para as margens nos relatórios). Máx. 2 casas decimais.' },
  { chave: 'stock_inicial', titulo: 'stock_inicial', largura: 12, obrigatorio: 'Não', descricao: 'Stock de arranque neste canal (default 0). SÓ é aplicado a produtos/canais NOVOS — o stock de produtos existentes ajusta-se em Stock → Entradas. Máx. 3 casas decimais.' },
  { chave: 'stock_minimo', titulo: 'stock_minimo', largura: 12, obrigatorio: 'Não', descricao: 'Nível de alerta de stock baixo neste canal (default 0).' },
  { chave: 'ingrediente', titulo: 'ingrediente', largura: 11, obrigatorio: 'Não', descricao: 'SIM = ingrediente de preparação (frango, cebola…): tem stock mas nunca aparece nas listagens de venda. Default NÃO.' },
  { chave: 'ativo', titulo: 'ativo', largura: 8, obrigatorio: 'Não', descricao: 'SIM/NÃO — produto visível no sistema. Default SIM.' },
]

// ============================================================
// NORMALIZAÇÃO DE CÉLULAS
// ============================================================

// Extrai o valor "cru" de uma célula ExcelJS como string (richText,
// fórmulas e hyperlinks reduzidos ao texto/resultado).
export function textoDaCelula(cell: ExcelJS.Cell): string {
  const v = cell.value
  if (v == null) return ''
  if (typeof v === 'string') return v.trim()
  if (typeof v === 'number') return String(v)
  if (typeof v === 'boolean') return v ? 'SIM' : 'NÃO'
  if (v instanceof Date) return v.toISOString()
  if (typeof v === 'object') {
    if ('richText' in v) return v.richText.map(r => r.text).join('').trim()
    if ('result' in v && v.result != null) return String(v.result).trim()
    if ('text' in v && v.text != null) return String(v.text).trim()
  }
  return String(v).trim()
}

type ResultadoDecimal = { ok: true; valor: string } | { ok: false; erro: string }

// Normaliza um valor monetário/quantidade para string decimal com ponto.
// Aceita "150,00", "150.00", 150, "1.500,50", "MT 250" — rejeita
// ambiguidades e excesso de casas decimais em vez de arredondar às
// escondidas. NUNCA usa parseFloat sobre o texto original.
export function normalizarDecimal(bruto: string, casasMax: number, nomeCampo: string): ResultadoDecimal {
  let s = bruto.trim().toUpperCase().replace(/\s|MT|MZN/g, '')
  if (!s) return { ok: false, erro: `${nomeCampo} vazio` }
  if (s.startsWith('-')) return { ok: false, erro: `${nomeCampo} não pode ser negativo` }

  const temPonto = s.includes('.')
  const temVirgula = s.includes(',')
  if (temPonto && temVirgula) {
    // O separador mais à direita é o decimal; o outro é de milhares
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.')
    } else {
      s = s.replace(/,/g, '')
    }
  } else if (temVirgula) {
    s = s.replace(',', '.')
  }

  if (!/^\d+(\.\d+)?$/.test(s)) {
    return { ok: false, erro: `${nomeCampo} inválido: "${bruto}"` }
  }
  const [inteira, decimal = ''] = s.split('.')
  if (decimal.length > casasMax) {
    return { ok: false, erro: `${nomeCampo} "${bruto}" tem mais de ${casasMax} casas decimais` }
  }
  if (inteira.replace(/^0+(?=\d)/, '').length > 8) {
    return { ok: false, erro: `${nomeCampo} "${bruto}" demasiado grande` }
  }
  return { ok: true, valor: decimal ? `${inteira}.${decimal}` : inteira }
}

function normalizarBooleano(bruto: string, nomeCampo: string, defeito: boolean):
  { ok: true; valor: boolean } | { ok: false; erro: string } {
  const s = bruto.trim().toUpperCase()
  if (!s) return { ok: true, valor: defeito }
  if (['SIM', 'S', 'TRUE', '1'].includes(s)) return { ok: true, valor: true }
  if (['NÃO', 'NAO', 'N', 'FALSE', '0'].includes(s)) return { ok: true, valor: false }
  return { ok: false, erro: `${nomeCampo} deve ser SIM ou NÃO (recebido "${bruto}")` }
}

// Comparação de nomes tolerante a maiúsculas e acentos
export function chaveNome(nome: string): string {
  return nome.trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')
}

// ============================================================
// PARSE + VALIDAÇÃO
// ============================================================

const LinhaSchema = z.object({
  nome: z.string().min(1, 'nome é obrigatório').max(200),
  sku: z.string().min(1, 'sku é obrigatório').max(60),
  codigoBarras: z.string().max(60).nullable(),
  categoria: z.string().min(1, 'categoria é obrigatória'),
  descricao: z.string().max(1000).nullable(),
  unidade: z.enum(UNIDADES, { error: `unidade deve ser uma de: ${UNIDADES.join(', ')}` }),
  canal: z.enum(CANAIS, { error: `canal deve ser um de: ${CANAIS.join(', ')}` }),
  // Dinheiro/quantidades já normalizados para string decimal
  precoVenda: z.string(),
  precoCusto: z.string().nullable(),
  stockInicial: z.string(),
  stockMinimo: z.string(),
  isIngrediente: z.boolean(),
  ativo: z.boolean(),
})

export type LinhaImportacao = z.infer<typeof LinhaSchema>

export interface ResultadoLinha {
  linha: number // nº da linha no Excel (1 = cabeçalho)
  sku: string
  nome: string
  canal: string
  acao: 'CRIAR' | 'ATUALIZAR' | 'ERRO'
  erros: string[]
  avisos: string[]
}

export interface StockPlaneado {
  canal: (typeof CANAIS)[number]
  precoVenda: string
  precoCusto: string | null
  stockInicial: string
  stockMinimo: string
  linha: number
}

export interface ProdutoPlaneado {
  sku: string
  nome: string
  descricao: string | null
  codigoBarras: string | null
  categoriaId: string
  unidadeMedida: (typeof UNIDADES)[number]
  isIngrediente: boolean
  ativo: boolean
  produtoExistenteId: string | null
  stocks: StockPlaneado[]
}

export interface PlanoImportacao {
  linhas: ResultadoLinha[]
  produtos: ProdutoPlaneado[]
  resumo: { aCriar: number; aAtualizar: number; linhasComErro: number; totalLinhas: number }
}

export interface ContextoValidacao {
  // Categorias ativas: id + nome
  categorias: { id: string; nome: string }[]
  // Produtos existentes cujos SKUs aparecem no ficheiro
  produtosPorSku: Map<string, { id: string; codigoBarras: string | null }>
  // SKU dono de cada código de barras já registado na BD
  skuPorCodigoBarras: Map<string, string>
  // Canais com linha StockCanal já existente, por produtoId ("id:CANAL")
  stockCanaisExistentes: Set<string>
}

interface LinhaCrua {
  linha: number
  valores: Record<string, string>
}

// Lê a folha "Produtos" de um buffer .xlsx e devolve as linhas não vazias
// como texto cru por coluna (a validação/normalização vem a seguir).
export async function lerFicheiro(buffer: ArrayBuffer): Promise<LinhaCrua[]> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer)
  const ws = wb.getWorksheet(SHEET_PRODUTOS) ?? wb.worksheets[0]
  if (!ws) throw new Error('Ficheiro sem folhas — use o template fornecido')

  const linhas: LinhaCrua[] = []
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return // cabeçalho
    const valores: Record<string, string> = {}
    let temConteudo = false
    COLUNAS.forEach((col, i) => {
      const texto = textoDaCelula(row.getCell(i + 1))
      valores[col.chave] = texto
      if (texto) temConteudo = true
    })
    if (temConteudo) linhas.push({ linha: rowNumber, valores })
  })
  return linhas
}

// Valida todas as linhas contra o schema e o contexto da BD e monta o
// plano de importação (agrupado por SKU). Não toca na base de dados.
export function validarLinhas(cruas: LinhaCrua[], ctx: ContextoValidacao): PlanoImportacao {
  const categoriaPorNome = new Map<string, { id: string; nome: string }[]>()
  for (const cat of ctx.categorias) {
    const chave = chaveNome(cat.nome)
    categoriaPorNome.set(chave, [...(categoriaPorNome.get(chave) ?? []), cat])
  }

  const resultados: ResultadoLinha[] = []
  const porSku = new Map<string, { primeiro: LinhaImportacao & { categoriaId: string }; stocks: StockPlaneado[] }>()
  const codigosBarrasNoFicheiro = new Map<string, string>() // codigoBarras → sku

  for (const crua of cruas) {
    const v = crua.valores
    const erros: string[] = []
    const avisos: string[] = []

    // Normalização prévia (dinheiro/quantidades/booleanos como texto)
    const precoVenda = v.preco_venda ? normalizarDecimal(v.preco_venda, 2, 'preco_venda') : { ok: false as const, erro: 'preco_venda é obrigatório' }
    const precoCusto = v.preco_custo ? normalizarDecimal(v.preco_custo, 2, 'preco_custo') : null
    const stockInicial = v.stock_inicial ? normalizarDecimal(v.stock_inicial, 3, 'stock_inicial') : { ok: true as const, valor: '0' }
    const stockMinimo = v.stock_minimo ? normalizarDecimal(v.stock_minimo, 3, 'stock_minimo') : { ok: true as const, valor: '0' }
    const ingrediente = normalizarBooleano(v.ingrediente, 'ingrediente', false)
    const ativo = normalizarBooleano(v.ativo, 'ativo', true)

    for (const r of [precoVenda, precoCusto, stockInicial, stockMinimo, ingrediente, ativo]) {
      if (r && !r.ok) erros.push(r.erro)
    }

    const candidato = {
      nome: v.nome.trim(),
      sku: v.sku.trim().toUpperCase(),
      codigoBarras: v.codigo_barras.trim() || null,
      categoria: v.categoria.trim(),
      descricao: v.descricao.trim() || null,
      unidade: v.unidade.trim().toUpperCase(),
      canal: v.canal.trim().toUpperCase(),
      precoVenda: precoVenda.ok ? precoVenda.valor : '0',
      precoCusto: precoCusto == null ? null : precoCusto.ok ? precoCusto.valor : null,
      stockInicial: stockInicial.ok ? stockInicial.valor : '0',
      stockMinimo: stockMinimo.ok ? stockMinimo.valor : '0',
      isIngrediente: ingrediente.ok ? ingrediente.valor : false,
      ativo: ativo.ok ? ativo.valor : true,
    }

    const parsed = LinhaSchema.safeParse(candidato)
    if (!parsed.success) {
      erros.push(...parsed.error.issues.map(i => i.message))
    }

    // Grupo → subcategoria: o produto aponta para a subcategoria se
    // indicada (tem de pertencer ao grupo), senão para o próprio grupo.
    // Categoria: tem de existir (e ser inequívoca)
    let categoriaId = ''
    if (candidato.categoria) {
      const matches = categoriaPorNome.get(chaveNome(candidato.categoria)) ?? []
      if (matches.length === 0) erros.push(`categoria "${candidato.categoria}" não existe — crie-a primeiro em Stock → Categorias`)
      else if (matches.length > 1) erros.push(`categoria "${candidato.categoria}" é ambígua (${matches.length} categorias com este nome)`)
      else categoriaId = matches[0].id
    }

    const registarResultado = (acao: ResultadoLinha['acao']) => {
      resultados.push({
        linha: crua.linha,
        sku: candidato.sku,
        nome: candidato.nome,
        canal: candidato.canal,
        acao,
        erros,
        avisos,
      })
    }

    if (erros.length > 0 || !parsed.success) {
      registarResultado('ERRO')
      continue
    }
    const linha = parsed.data

    const existente = ctx.produtosPorSku.get(linha.sku)

    // Código de barras único — contra a BD e dentro do próprio ficheiro
    if (linha.codigoBarras) {
      const donoBD = ctx.skuPorCodigoBarras.get(linha.codigoBarras)
      if (donoBD && donoBD !== linha.sku) {
        erros.push(`codigo_barras "${linha.codigoBarras}" já pertence ao produto com SKU ${donoBD}`)
      }
      const donoFicheiro = codigosBarrasNoFicheiro.get(linha.codigoBarras)
      if (donoFicheiro && donoFicheiro !== linha.sku) {
        erros.push(`codigo_barras "${linha.codigoBarras}" repetido no ficheiro para o SKU ${donoFicheiro}`)
      }
    }

    const grupo = porSku.get(linha.sku)
    if (grupo) {
      // Linhas adicionais do mesmo SKU: só o canal pode variar
      const p = grupo.primeiro
      const camposProduto: [string, string | boolean | null, string | boolean | null][] = [
        ['nome', p.nome, linha.nome],
        ['codigo_barras', p.codigoBarras, linha.codigoBarras],
        ['categoria', p.categoriaId, categoriaId],
        ['unidade', p.unidade, linha.unidade],
        ['ingrediente', p.isIngrediente, linha.isIngrediente],
        ['ativo', p.ativo, linha.ativo],
      ]
      for (const [campo, a, b] of camposProduto) {
        if (a !== b) erros.push(`${campo} difere da linha anterior com o mesmo SKU — os dados do produto têm de ser iguais em todas as linhas`)
      }
      if (grupo.stocks.some(s => s.canal === linha.canal)) {
        erros.push(`canal ${linha.canal} repetido no ficheiro para o SKU ${linha.sku}`)
      }
    }

    if (erros.length > 0) {
      registarResultado('ERRO')
      continue
    }

    // Stock inicial só se aplica a linhas StockCanal novas
    const canalJaExiste = existente != null && ctx.stockCanaisExistentes.has(`${existente.id}:${linha.canal}`)
    if (canalJaExiste && Number(linha.stockInicial) > 0) {
      avisos.push('stock_inicial ignorado — o produto já tem stock neste canal; ajuste em Stock → Entradas')
    }

    if (linha.codigoBarras) codigosBarrasNoFicheiro.set(linha.codigoBarras, linha.sku)

    const stock: StockPlaneado = {
      canal: linha.canal,
      precoVenda: linha.precoVenda,
      precoCusto: linha.precoCusto,
      stockInicial: canalJaExiste ? '0' : linha.stockInicial,
      stockMinimo: linha.stockMinimo,
      linha: crua.linha,
    }
    if (grupo) {
      grupo.stocks.push(stock)
    } else {
      porSku.set(linha.sku, { primeiro: { ...linha, categoriaId }, stocks: [stock] })
    }

    registarResultado(existente ? 'ATUALIZAR' : 'CRIAR')
  }

  // SKUs em que TODAS as linhas passaram entram no plano; um SKU com
  // linha de produto válida + linha de canal inválida entra parcialmente
  // (só os canais válidos) — o erro fica visível no preview.
  const produtos: ProdutoPlaneado[] = []
  for (const [sku, grupo] of porSku) {
    const existente = ctx.produtosPorSku.get(sku)
    produtos.push({
      sku,
      nome: grupo.primeiro.nome,
      descricao: grupo.primeiro.descricao,
      codigoBarras: grupo.primeiro.codigoBarras,
      categoriaId: grupo.primeiro.categoriaId,
      unidadeMedida: grupo.primeiro.unidade,
      isIngrediente: grupo.primeiro.isIngrediente,
      ativo: grupo.primeiro.ativo,
      produtoExistenteId: existente?.id ?? null,
      stocks: grupo.stocks,
    })
  }

  return {
    linhas: resultados,
    produtos,
    resumo: {
      aCriar: produtos.filter(p => !p.produtoExistenteId).length,
      aAtualizar: produtos.filter(p => p.produtoExistenteId).length,
      linhasComErro: resultados.filter(r => r.acao === 'ERRO').length,
      totalLinhas: resultados.length,
    },
  }
}

// ============================================================
// TEMPLATE
// ============================================================

const EXEMPLOS: string[][] = [
  ['Cerveja Dos M 330ml', 'CERV-2M-330', '6291041500213', 'Cervejas', '', 'UNIDADE', 'RESTAURANTE', '150,00', '80,00', '48', '12', 'NÃO', 'SIM'],
  ['Cerveja Dos M 330ml', 'CERV-2M-330', '6291041500213', 'Cervejas', '', 'UNIDADE', 'BOTTLESTORE', '120,00', '80,00', '120', '24', 'NÃO', 'SIM'],
  ['Refresco Coca-Cola 350ml', 'REFR-COCA-350', '', 'Refrescos', '', 'UNIDADE', 'BOTTLESTORE', '90,00', '55,00', '60', '12', 'NÃO', 'SIM'],
  ['Água Mineral 500ml', 'AGUA-MIN-500', '', 'Refrescos', '', 'UNIDADE', 'PISCINA', '80,00', '40,00', '24', '6', 'NÃO', 'SIM'],
  ['Sumo Natural de Maracujá 300ml', 'SUMO-MARA-300', '', 'Sumos', 'Sumo natural feito na hora', 'UNIDADE', 'RESTAURANTE', '180,00', '', '0', '0', 'NÃO', 'SIM'],
  ['Bifana no Pão', 'COM-BIF-001', '', 'Pratos Principais', 'Pão com bifana grelhada e molho da casa', 'PORCAO', 'RESTAURANTE', '250,00', '110,00', '0', '0', 'NÃO', 'SIM'],
  ['Batatas Fritas (porção)', 'COM-BAT-001', '', 'Aperitivos', '', 'PORCAO', 'RESTAURANTE', '150,00', '60,00', '0', '0', 'NÃO', 'SIM'],
  ['Whisky Jameson 750ml', 'WHIS-JAM-750', '', 'Whiskies', '', 'UNIDADE', 'BOTTLESTORE', '2500,00', '1800,00', '6', '2', 'NÃO', 'SIM'],
  ['Frango Inteiro (ingrediente)', 'ING-FRANGO-KG', '', 'Comida', 'Ingrediente de cozinha — não aparece à venda', 'KG', 'RESTAURANTE', '0,00', '350,00', '10', '2', 'SIM', 'SIM'],
]

// Constrói o workbook do template com dropdowns alimentados pelas
// categorias reais (passadas pelo endpoint a partir da BD).
export function construirTemplate(nomesCategorias: string[]): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'EL Globo'

  // ---- Sheet 1: Produtos ----
  const ws = wb.addWorksheet(SHEET_PRODUTOS, { views: [{ state: 'frozen', ySplit: 1 }] })
  ws.columns = COLUNAS.map(c => ({ header: c.titulo, key: c.chave, width: c.largura }))

  const header = ws.getRow(1)
  header.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } }
  header.height = 22
  header.alignment = { vertical: 'middle' }

  for (const exemplo of EXEMPLOS) ws.addRow(exemplo)

  // Dropdowns (data validation) — as listas vivem na folha "Listas"
  const colIndex = (chave: string) => COLUNAS.findIndex(c => c.chave === chave) + 1
  const validacoes: { col: number; formula: string; erro: string }[] = [
    { col: colIndex('categoria'), formula: `${SHEET_LISTAS}!$A$2:$A$${1 + Math.max(nomesCategorias.length, 1)}`, erro: 'Escolha uma categoria existente (folha Listas)' },
    { col: colIndex('unidade'), formula: `${SHEET_LISTAS}!$B$2:$B$${1 + UNIDADES.length}`, erro: `Valores válidos: ${UNIDADES.join(', ')}` },
    { col: colIndex('canal'), formula: `${SHEET_LISTAS}!$C$2:$C$${1 + CANAIS.length}`, erro: `Valores válidos: ${CANAIS.join(', ')}` },
    { col: colIndex('ingrediente'), formula: '"SIM,NÃO"', erro: 'SIM ou NÃO' },
    { col: colIndex('ativo'), formula: '"SIM,NÃO"', erro: 'SIM ou NÃO' },
  ]
  for (const val of validacoes) {
    for (let r = 2; r <= LINHAS_COM_VALIDACAO; r++) {
      ws.getCell(r, val.col).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [val.formula],
        showErrorMessage: true,
        errorStyle: 'error',
        errorTitle: 'Valor inválido',
        error: val.erro,
      }
    }
  }

  // ---- Sheet 2: Instruções ----
  const wsInstr = wb.addWorksheet(SHEET_INSTRUCOES)
  wsInstr.columns = [{ width: 16 }, { width: 12 }, { width: 110 }]
  const titulo = wsInstr.addRow(['IMPORTAÇÃO DE PRODUTOS — EL GLOBO'])
  titulo.font = { bold: true, size: 14 }
  wsInstr.addRow([])
  const notas = [
    'Cada linha da folha "Produtos" é um produto NUM canal. Para vender o mesmo produto em 2 canais, repita o SKU em 2 linhas mudando o canal e o preço.',
    'O SKU é a chave: SKU novo cria o produto; SKU existente atualiza nome, categoria, preços e stock mínimo.',
    'O stock_inicial só é aplicado a produtos/canais novos. Para repor stock de produtos existentes use Stock → Entradas (fica no histórico de movimentações).',
    'Preços em MT, sem separador de milhares: escreva 1500,00 ou 1500.00 — nunca 1.500,00.',
    'Em atualizações (SKU existente), as colunas opcionais deixadas em branco (codigo_barras, descricao, preco_custo) mantêm o valor que já está no sistema — não apagam nada.',
    'O IVA não se define por produto — é a configuração global "iva_percentagem" do sistema.',
    'As linhas de exemplo (Cerveja Dos M, Bifana…) devem ser APAGADAS antes de importar — senão são importadas como produtos reais.',
    'Depois do upload o sistema mostra uma pré-visualização com os erros por linha. Nada é gravado antes de confirmar.',
  ]
  for (const [i, n] of notas.entries()) {
    const r = wsInstr.addRow([`${i + 1}.`, '', n])
    r.getCell(3).alignment = { wrapText: true }
    r.getCell(1).font = { bold: true }
  }
  wsInstr.addRow([])
  const cab = wsInstr.addRow(['Coluna', 'Obrigatório', 'Descrição'])
  cab.font = { bold: true }
  cab.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } }
  for (const c of COLUNAS) {
    const r = wsInstr.addRow([c.titulo, c.obrigatorio, c.descricao])
    r.getCell(3).alignment = { wrapText: true }
  }

  // ---- Sheet 3: Listas (fontes dos dropdowns) ----
  const wsListas = wb.addWorksheet(SHEET_LISTAS)
  wsListas.columns = [
    { header: 'categorias', width: 28 },
    { header: 'unidades', width: 16 },
    { header: 'canais', width: 16 },
    { header: 'sim_nao', width: 10 },
  ]
  wsListas.getRow(1).font = { bold: true }
  const maxLen = Math.max(nomesCategorias.length, UNIDADES.length, CANAIS.length, 2)
  for (let i = 0; i < maxLen; i++) {
    wsListas.addRow([
      nomesCategorias[i] ?? '',
      UNIDADES[i] ?? '',
      CANAIS[i] ?? '',
      i === 0 ? 'SIM' : i === 1 ? 'NÃO' : '',
    ])
  }

  return wb
}
