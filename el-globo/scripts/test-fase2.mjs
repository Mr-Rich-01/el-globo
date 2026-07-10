// Teste de integração da Fase 2 (stock inteligente) contra a BD real
// via API HTTP. Executar com o servidor a correr em localhost:3000:
//   node scripts/test-fase2.mjs
// Script temporário de verificação — pode ser apagado depois.

const BASE = 'http://localhost:3000'
const SENHA = 'elglobo123'

let passou = 0
let falhou = 0
function check(nome, cond, detalhe = '') {
  if (cond) { passou++; console.log(`  PASS  ${nome}`) }
  else { falhou++; console.log(`  FAIL  ${nome} ${detalhe}`) }
}

async function login(email) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, senha: SENHA }),
  })
  if (!res.ok) throw new Error(`Login falhou para ${email}: ${res.status}`)
  const cookie = res.headers.getSetCookie().find(c => c.startsWith('elglobo_token='))
  return cookie.split(';')[0]
}

async function api(cookie, method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: body ? JSON.stringify(body) : undefined,
  })
  let data = null
  try { data = await res.json() } catch { /* páginas HTML etc. */ }
  return { status: res.status, data }
}

function stockDe(produtos, sku, canal) {
  const p = produtos.find(x => x.sku === sku)
  const sc = p?.stockCanais.find(s => s.canal === canal)
  return sc ? Number(sc.stockAtual) : null
}

async function main() {
  const admin = await login('admin@elglobo.com')
  const gerenteRest = await login('gerente@elglobo.com')
  const gerenteLoja = await login('gerente.loja@elglobo.com')
  console.log('Logins OK (admin, gerente restaurante, gerente bottlestore)\n')

  const { data: prods0 } = await api(admin, 'GET', '/api/produtos')
  const caixa = prods0.find(p => p.sku === 'CER-DOS-CX24')
  const unidade = prods0.find(p => p.sku === 'CER-DOS-330')
  const fator = unidade.fatorConversao

  // ────────────────────────────────────────────────────────────
  console.log('1) Desmanche manual (gerente restaurante, sem canal no body → RESTAURANTE)')
  const cxAntes = stockDe(prods0, 'CER-DOS-CX24', 'RESTAURANTE')
  const unAntes = stockDe(prods0, 'CER-DOS-330', 'RESTAURANTE')

  const d1 = await api(gerenteRest, 'POST', '/api/stock/desmanchar', {
    produtoId: caixa.id, quantidade: 1,
  })
  check('responde 200', d1.status === 200, JSON.stringify(d1.data))

  const { data: prods1 } = await api(admin, 'GET', '/api/produtos')
  check(`caixa RESTAURANTE ${cxAntes} → ${cxAntes - 1}`, stockDe(prods1, 'CER-DOS-CX24', 'RESTAURANTE') === cxAntes - 1)
  check(`unidade RESTAURANTE ${unAntes} → ${unAntes + fator}`, stockDe(prods1, 'CER-DOS-330', 'RESTAURANTE') === unAntes + fator)

  // ────────────────────────────────────────────────────────────
  console.log('\n2) Gerente da loja NÃO desmancha no canal RESTAURANTE (canal do body ignorado/recusado)')
  const d2 = await api(gerenteLoja, 'POST', '/api/stock/desmanchar', {
    produtoId: caixa.id, quantidade: 1, canal: 'RESTAURANTE',
  })
  check('responde 403', d2.status === 403, `status=${d2.status} ${JSON.stringify(d2.data)}`)

  // ────────────────────────────────────────────────────────────
  console.log('\n3) Desmanche com stock insuficiente → erro claro, stock intacto')
  const cx1 = stockDe(prods1, 'CER-DOS-CX24', 'RESTAURANTE')
  const d3 = await api(gerenteRest, 'POST', '/api/stock/desmanchar', {
    produtoId: caixa.id, quantidade: 9999,
  })
  check('responde 400', d3.status === 400, `status=${d3.status}`)
  check('mensagem menciona falta', /insuficiente|faltam/i.test(d3.data?.erro ?? ''), d3.data?.erro)
  const { data: prods3 } = await api(admin, 'GET', '/api/produtos')
  const cx3 = stockDe(prods3, 'CER-DOS-CX24', 'RESTAURANTE')
  check('stock da caixa não mudou nem ficou negativo', cx3 === cx1 && cx3 >= 0, `antes=${cx1} depois=${cx3}`)

  // ────────────────────────────────────────────────────────────
  console.log('\n4) Transferência ADMIN Bottlestore → Restaurante')
  const origAntes = stockDe(prods3, 'CER-DOS-CX24', 'BOTTLESTORE')
  const destAntes = stockDe(prods3, 'CER-DOS-CX24', 'RESTAURANTE')
  const t1 = await api(admin, 'POST', '/api/stock/transferir', {
    produtoId: caixa.id, canalOrigem: 'BOTTLESTORE', canalDestino: 'RESTAURANTE', quantidade: 2,
  })
  check('responde 200', t1.status === 200, JSON.stringify(t1.data))
  const { data: prods4 } = await api(admin, 'GET', '/api/produtos')
  check(`origem BOTTLESTORE ${origAntes} → ${origAntes - 2}`, stockDe(prods4, 'CER-DOS-CX24', 'BOTTLESTORE') === origAntes - 2)
  check(`destino RESTAURANTE ${destAntes} → ${destAntes + 2}`, stockDe(prods4, 'CER-DOS-CX24', 'RESTAURANTE') === destAntes + 2)

  // ────────────────────────────────────────────────────────────
  console.log('\n5) Gerente da loja tenta transferir para o RESTAURANTE → 403')
  const t2 = await api(gerenteLoja, 'POST', '/api/stock/transferir', {
    produtoId: caixa.id, canalOrigem: 'BOTTLESTORE', canalDestino: 'RESTAURANTE', quantidade: 1,
  })
  check('responde 403', t2.status === 403, `status=${t2.status} ${JSON.stringify(t2.data)}`)
  const { data: prods5 } = await api(admin, 'GET', '/api/produtos')
  check('stock intacto após 403', stockDe(prods5, 'CER-DOS-CX24', 'BOTTLESTORE') === origAntes - 2)

  // ────────────────────────────────────────────────────────────
  console.log('\n6) Transferência com stock insuficiente → erro claro, nunca negativo')
  const t3 = await api(admin, 'POST', '/api/stock/transferir', {
    produtoId: caixa.id, canalOrigem: 'BOTTLESTORE', canalDestino: 'RESTAURANTE', quantidade: 9999,
  })
  check('responde 400', t3.status === 400, `status=${t3.status}`)
  check('mensagem menciona falta', /insuficiente|faltam/i.test(t3.data?.erro ?? ''), t3.data?.erro)
  const { data: prods6 } = await api(admin, 'GET', '/api/produtos')
  const orig6 = stockDe(prods6, 'CER-DOS-CX24', 'BOTTLESTORE')
  check('stock origem intacto e não-negativo', orig6 === origAntes - 2 && orig6 >= 0, `=${orig6}`)

  // ────────────────────────────────────────────────────────────
  console.log('\n7) Transferência para canal SEM linha de destino cria a linha (herda preço)')
  // Água tónica não existe? existe em todos. Usa Francesinha (só RESTAURANTE).
  const francesinha = prods6.find(p => p.sku === 'COM-FRA-001')
  const temPiscina = francesinha.stockCanais.some(s => s.canal === 'PISCINA')
  const t4 = await api(admin, 'POST', '/api/stock/transferir', {
    produtoId: francesinha.id, canalOrigem: 'RESTAURANTE', canalDestino: 'PISCINA', quantidade: 1,
  })
  check('responde 200', t4.status === 200, JSON.stringify(t4.data))
  const { data: prods7 } = await api(admin, 'GET', '/api/produtos')
  const fra7 = prods7.find(p => p.sku === 'COM-FRA-001')
  const scPisc = fra7.stockCanais.find(s => s.canal === 'PISCINA')
  if (!temPiscina) {
    check('linha PISCINA criada com preço herdado', scPisc && Number(scPisc.stockAtual) >= 1 &&
      Number(scPisc.precoVenda) === Number(fra7.stockCanais.find(s => s.canal === 'RESTAURANTE').precoVenda),
      JSON.stringify(scPisc))
  } else {
    check('linha PISCINA incrementada', Number(scPisc.stockAtual) >= 1)
  }
  // devolver a unidade transferida (limpeza)
  await api(admin, 'POST', '/api/stock/transferir', {
    produtoId: francesinha.id, canalOrigem: 'PISCINA', canalDestino: 'RESTAURANTE', quantidade: 1,
  })

  // ────────────────────────────────────────────────────────────
  console.log('\n8) Alerta pelo equivalente total (família caixa/unidade)')
  // Cria família de teste: caixa com 2 cheias, unidade com 0 soltas e mínimo 5.
  const { data: cats } = await api(admin, 'GET', '/api/categorias')
  const catId = cats[0].id
  const ts = Date.now()
  const rCx = await api(admin, 'POST', '/api/produtos', {
    nome: `TESTE Caixa Alerta ${ts}`, sku: `TST-CX-${ts}`, categoriaId: catId,
    unidadeMedida: 'UNIDADE',
    stocks: [{ canal: 'BOTTLESTORE', precoVenda: 100, stockAtual: 2, stockMinimo: 0 }],
  })
  const rUn = await api(admin, 'POST', '/api/produtos', {
    nome: `TESTE Unidade Alerta ${ts}`, sku: `TST-UN-${ts}`, categoriaId: catId,
    unidadeMedida: 'UNIDADE', parentProductId: rCx.data.produto.id, fatorConversao: 24,
    stocks: [{ canal: 'BOTTLESTORE', precoVenda: 5, stockAtual: 0, stockMinimo: 5 }],
  })
  check('família de teste criada', rCx.status === 201 && rUn.status === 201)

  // Alerta na LISTAGEM é calculado no client com stockAbaixoMinimo (lib partilhada);
  // verificamos aqui a mesma lógica com os dados reais da API.
  const { data: prods8 } = await api(admin, 'GET', '/api/produtos')
  const un8 = prods8.find(p => p.sku === `TST-UN-${ts}`)
  const cx8 = prods8.find(p => p.sku === `TST-CX-${ts}`)
  const scUn = un8.stockCanais.find(s => s.canal === 'BOTTLESTORE')
  const scCx = cx8.stockCanais.find(s => s.canal === 'BOTTLESTORE')
  const equivalente = Number(scUn.stockAtual) + Number(scCx.stockAtual) * un8.fatorConversao
  check('equivalente = 48 un (2 cx cheias, 0 soltas)', equivalente === 48, `=${equivalente}`)
  check('NÃO alerta (48 > mínimo 5)', !(equivalente <= Number(scUn.stockMinimo)))

  // Dashboard (server) usa contarAlertasStock → o nº de alertas não deve
  // incluir a família de teste. Baixamos o stock para 0 cx + 3 un (< mín 5)
  // e o alerta TEM de disparar (contagem sobe 1 para a linha da unidade).
  const dash1 = await api(admin, 'GET', '/dashboard')
  const htmlAntes = await (await fetch(`${BASE}/dashboard`, { headers: { Cookie: admin } })).text()
  const alertasAntes = Number(htmlAntes.match(/linhas? de stock abaixo do mínimo/) ? htmlAntes.match(/(\d+)<\/div><div[^>]*>linhas? de stock abaixo do mínimo/)?.[1] : NaN)

  // desmancha as 2 caixas e vende (ajuste via PUT) para ficar abaixo do mínimo
  await api(admin, 'POST', '/api/stock/desmanchar', { produtoId: cx8.id, quantidade: 2, canal: 'BOTTLESTORE' })
  await api(admin, 'PUT', `/api/produtos/${un8.id}`, {
    stocks: [{ canal: 'BOTTLESTORE', precoVenda: 5, stockAtual: 3, stockMinimo: 5 }],
  })
  const htmlDepois = await (await fetch(`${BASE}/dashboard`, { headers: { Cookie: admin } })).text()
  const alertasDepois = Number(htmlDepois.match(/(\d+)<\/div><div[^>]*>linhas? de stock abaixo do mínimo/)?.[1])
  check(`dashboard: alertas subiram (${alertasAntes} → ${alertasDepois})`,
    Number.isFinite(alertasAntes) && Number.isFinite(alertasDepois) && alertasDepois === alertasAntes + 1,
    `antes=${alertasAntes} depois=${alertasDepois}`)
  void dash1

  // limpeza: desativar produtos de teste
  await api(admin, 'DELETE', `/api/produtos/${un8.id}`)
  await api(admin, 'DELETE', `/api/produtos/${cx8.id}`)

  console.log(`\n═══ Resultado: ${passou} PASS, ${falhou} FAIL ═══`)
  process.exit(falhou > 0 ? 1 : 0)
}

main().catch(e => { console.error(e); process.exit(1) })
