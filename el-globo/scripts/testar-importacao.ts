/**
 * Bateria de testes da importação de produtos via Excel (sem BD):
 * normalização de dinheiro, roundtrip template→parse→validação,
 * hierarquia grupo/subcategoria e colisões de nomes normalizados.
 *
 *   Execução:  npx tsx scripts/testar-importacao.ts
 */

import {
  construirTemplate,
  lerFicheiro,
  validarLinhas,
  normalizarDecimal,
  type ContextoValidacao,
  type CategoriaTemplate,
} from '../src/lib/importacao-produtos'

let falhas = 0
function assert(cond: boolean, msg: string) {
  if (!cond) { falhas++; console.error('FALHOU:', msg) }
  else console.log('ok:', msg)
}

function decimalOk(bruto: string, casas: number, esperado: string, msg: string) {
  const r = normalizarDecimal(bruto, casas, 'x')
  assert(r.ok && r.valor === esperado, `${msg} (${JSON.stringify(r)})`)
}

async function validar(linhasExcel: (string | number)[][], ctx: ContextoValidacao, categorias: CategoriaTemplate[]) {
  const wb = construirTemplate(categorias)
  const ws = wb.getWorksheet('Produtos')!
  ws.spliceRows(2, 9) // remove as linhas de exemplo
  for (const linha of linhasExcel) ws.addRow(linha)
  const cruas = await lerFicheiro((await wb.xlsx.writeBuffer()) as ArrayBuffer)
  return validarLinhas(cruas, ctx)
}

async function main() {
  // ---------- normalizarDecimal ----------
  decimalOk('150,00', 2, '150.00', 'vírgula decimal')
  decimalOk('150.00', 2, '150.00', 'ponto decimal')
  decimalOk('1.500,50', 2, '1500.50', 'milhares pt + vírgula decimal')
  decimalOk('1,500.50', 2, '1500.50', 'milhares en + ponto decimal')
  decimalOk('MT 250', 2, '250', 'prefixo de moeda removido')
  decimalOk('0,500', 3, '0.500', 'quantidade com 3 casas')
  assert(!normalizarDecimal('12,999', 2, 'x').ok, 'mais casas que o máximo → erro (nunca arredonda)')
  assert(!normalizarDecimal('-5', 2, 'x').ok, 'negativo → erro')
  assert(!normalizarDecimal('abc', 2, 'x').ok, 'texto → erro')

  // ---------- roundtrip + hierarquia ----------
  const CATS: CategoriaTemplate[] = [
    { nome: 'Bebidas Alcoólicas', parentNome: null },
    { nome: 'Cervejas', parentNome: 'Bebidas Alcoólicas' },
    { nome: 'Comida', parentNome: null },
    { nome: 'Pratos Principais', parentNome: 'Comida' },
    { nome: 'Snacks', parentNome: null },
  ]
  const ctx: ContextoValidacao = {
    categorias: [
      { id: 'g1', nome: 'Bebidas Alcoólicas', parentCategoryId: null },
      { id: 's1', nome: 'Cervejas', parentCategoryId: 'g1' },
      { id: 'g2', nome: 'Comida', parentCategoryId: null },
      { id: 's2', nome: 'Pratos Principais', parentCategoryId: 'g2' },
      { id: 'g3', nome: 'Snacks', parentCategoryId: null },
    ],
    produtosPorSku: new Map([['T-EXIST', { id: 'p9', codigoBarras: null }]]),
    skuPorCodigoBarras: new Map(),
    stockCanaisExistentes: new Set(['p9:RESTAURANTE']),
  }
  // colunas: nome, sku, cb, grupo, subcategoria, descricao, unidade, canal, pv, pc, si, sm, ing, ativo
  const plano = await validar([
    ['Cerveja A', 't-001', '', 'bebidas alcoolicas', 'CERVEJAS', '', 'UNIDADE', 'RESTAURANTE', '150,00', '80.5', '48', '12', '', ''],
    ['Cerveja A', 'T-001', '', 'Bebidas Alcoólicas', 'Cervejas', '', 'UNIDADE', 'BOTTLESTORE', 120, '', '60', '', 'NÃO', 'SIM'],
    ['Genérico Grupo', 'T-002', '', 'Snacks', '', '', 'UNIDADE', 'BOTTLESTORE', '50', '', '0', '', '', ''],
    ['Linha Má', 'T-003', '', 'Grupo Inexistente', '', '', 'CAIXA', 'LOJA', '12,999', '', '-3', '', 'TALVEZ', ''],
    ['Existente', 'T-EXIST', '', 'Comida', 'Pratos Principais', '', 'PORCAO', 'RESTAURANTE', '90,00', '', '50', '5', '', ''],
    ['Conflito Nome', 'T-001', '', 'Bebidas Alcoólicas', 'Cervejas', '', 'UNIDADE', 'PISCINA', '100', '', '0', '', '', ''],
    ['Sub de Outro Grupo', 'T-004', '', 'Comida', 'Cervejas', '', 'PORCAO', 'RESTAURANTE', '100', '', '0', '', '', ''],
    ['Sub na Coluna Grupo', 'T-005', '', 'Cervejas', '', '', 'UNIDADE', 'RESTAURANTE', '100', '', '0', '', '', ''],
  ], ctx, CATS)
  const [r1, r2, r3, r4, r5, r6, r7, r8] = plano.linhas

  assert(r1.acao === 'CRIAR' && r1.erros.length === 0, 'grupo+sub case/acento-insensitive → CRIAR')
  assert(plano.produtos.find(p => p.sku === 'T-001')!.categoriaId === 's1', 'produto aponta à subcategoria')
  assert(r2.acao === 'CRIAR' && r2.erros.length === 0, '2º canal do mesmo SKU novo → CRIAR')
  const t1 = plano.produtos.find(p => p.sku === 'T-001')!
  assert(t1.stocks.length === 2 && t1.stocks[0].precoVenda === '150.00' && t1.stocks[1].precoVenda === '120', 'stocks por canal com preços normalizados')
  assert(r3.acao === 'CRIAR' && plano.produtos.find(p => p.sku === 'T-002')!.categoriaId === 'g3', 'sem subcategoria → genérico do grupo')
  assert(r4.acao === 'ERRO' && r4.erros.length >= 4, `linha má acumula erros (${r4.erros.length})`)
  assert(r5.acao === 'ATUALIZAR' && r5.avisos.length === 1, 'SKU existente → ATUALIZAR com aviso de stock_inicial ignorado')
  assert(plano.produtos.find(p => p.sku === 'T-EXIST')!.stocks[0].stockInicial === '0', 'stock_inicial zerado para canal existente')
  assert(r6.acao === 'ERRO' && r6.erros.length > 0, 'campos do produto diferentes no mesmo SKU → erro')
  assert(r7.acao === 'ERRO' && r7.erros[0].includes('não pertence ao grupo'), 'sub de outro grupo → erro')
  assert(r8.acao === 'ERRO' && r8.erros[0].includes('é uma subcategoria de'), 'sub na coluna grupo → erro pedagógico')
  assert(plano.resumo.aCriar === 2 && plano.resumo.aAtualizar === 1, `resumo correto (${JSON.stringify(plano.resumo)})`)

  // ---------- colisões de nomes normalizados ("Chá" vs "Cha") ----------
  const CATS_COLISAO: CategoriaTemplate[] = [
    { nome: 'Chá', parentNome: null },
    { nome: 'Cha', parentNome: null },
    { nome: 'Comida', parentNome: null },
    { nome: 'Chá', parentNome: 'Comida' },
    { nome: 'Cha', parentNome: 'Comida' },
  ]
  const ctxColisao: ContextoValidacao = {
    categorias: [
      { id: 'g-cha-acento', nome: 'Chá', parentCategoryId: null },
      { id: 'g-cha-plain', nome: 'Cha', parentCategoryId: null },
      { id: 'g-comida', nome: 'Comida', parentCategoryId: null },
      { id: 's-cha-acento', nome: 'Chá', parentCategoryId: 'g-comida' },
      { id: 's-cha-plain', nome: 'Cha', parentCategoryId: 'g-comida' },
    ],
    produtosPorSku: new Map(),
    skuPorCodigoBarras: new Map(),
    stockCanaisExistentes: new Set(),
  }
  const colisao = await validar([
    ['Grupo Normalizado', 'C-001', '', 'cha', '', '', 'UNIDADE', 'RESTAURANTE', '10', '', '0', '', '', ''],
    ['Grupo Exato', 'C-002', '', 'Chá', '', '', 'UNIDADE', 'RESTAURANTE', '10', '', '0', '', '', ''],
    ['Sub Normalizada', 'C-003', '', 'Comida', 'cha', '', 'UNIDADE', 'RESTAURANTE', '10', '', '0', '', '', ''],
    ['Sub Exata', 'C-004', '', 'Comida', 'Chá', '', 'UNIDADE', 'RESTAURANTE', '10', '', '0', '', '', ''],
  ], ctxColisao, CATS_COLISAO)
  const [c1, c2, c3, c4] = colisao.linhas

  assert(c1.acao === 'ERRO' && c1.erros[0].includes('grupo ambíguo') && c1.erros[0].includes('"Chá" e "Cha"'),
    `colisão de grupo sem nome exato → erro explícito (${c1.erros[0]})`)
  assert(c2.acao === 'CRIAR' && colisao.produtos.find(p => p.sku === 'C-002')!.categoriaId === 'g-cha-acento',
    'colisão de grupo COM nome exato → desempata para a categoria certa')
  assert(c3.acao === 'ERRO' && c3.erros[0].includes('subcategoria ambígua') && c3.erros[0].includes('"Chá" e "Cha"'),
    `colisão de subcategoria sem nome exato → erro explícito (${c3.erros[0]})`)
  assert(c4.acao === 'CRIAR' && colisao.produtos.find(p => p.sku === 'C-004')!.categoriaId === 's-cha-acento',
    'colisão de subcategoria COM nome exato → desempata para a categoria certa')

  console.log(falhas === 0 ? '\nTODOS OS TESTES PASSARAM' : `\n${falhas} TESTE(S) FALHARAM`)
  process.exit(falhas === 0 ? 0 : 1)
}

main().catch(e => { console.error(e); process.exit(1) })
