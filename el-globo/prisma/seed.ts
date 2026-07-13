import { PrismaClient, Role, TipoCategoria, UnidadeMedida, CanalVenda } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import bcrypt from 'bcryptjs'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

type StockSeed = { preco: number; custo?: number; stock: number; min: number }

// Cria/atualiza um produto e as suas linhas de stock por canal.
// A existência de uma linha StockCanal define a disponibilidade no canal.
async function criarProduto(opts: {
  sku: string
  nome: string
  descricao?: string
  codigoBarras?: string
  categoriaId: string
  unidadeMedida: UnidadeMedida
  parentProductId?: string
  fatorConversao?: number
  stocks: Partial<Record<CanalVenda, StockSeed>>
}) {
  const { stocks, ...dados } = opts
  const produto = await prisma.produto.upsert({
    where: { sku: dados.sku },
    // Re-seed atualiza categoria/descrição (migração para subcategorias
    // e cardápio) sem tocar em preços/stocks já geridos pelos gestores.
    update: { categoriaId: dados.categoriaId, descricao: dados.descricao },
    create: dados,
  })

  for (const [canal, s] of Object.entries(stocks) as [CanalVenda, StockSeed][]) {
    await prisma.stockCanal.upsert({
      where: { produtoId_canal: { produtoId: produto.id, canal } },
      update: {},
      create: {
        produtoId: produto.id,
        canal,
        precoVenda: s.preco,
        precoCusto: s.custo ?? null,
        stockAtual: s.stock,
        stockMinimo: s.min,
      },
    })
  }
  return produto
}

async function main() {
  console.log('🌱 Iniciando seed do banco de dados EL Globo...')

  // ─── Utilizadores ───────────────────────────────────────────
  const senhaHash = await bcrypt.hash('elglobo123', 12)

  await prisma.user.upsert({
    where: { email: 'admin@elglobo.com' },
    update: {},
    create: {
      nome: 'Administrador',
      email: 'admin@elglobo.com',
      senha: senhaHash,
      role: Role.ADMIN,
      canal: null, // Global — dono do complexo, vê tudo
    },
  })

  await prisma.user.upsert({
    where: { email: 'gerente@elglobo.com' },
    update: { canal: CanalVenda.RESTAURANTE },
    create: {
      nome: 'João Gerente (Restaurante)',
      email: 'gerente@elglobo.com',
      senha: senhaHash,
      role: Role.GERENTE,
      canal: CanalVenda.RESTAURANTE,
    },
  })

  await prisma.user.upsert({
    where: { email: 'gerente.loja@elglobo.com' },
    update: {},
    create: {
      nome: 'Maria Gerente (Bottlestore)',
      email: 'gerente.loja@elglobo.com',
      senha: senhaHash,
      role: Role.GERENTE,
      canal: CanalVenda.BOTTLESTORE,
    },
  })

  await prisma.user.upsert({
    where: { email: 'mesa@elglobo.com' },
    update: { canal: CanalVenda.RESTAURANTE },
    create: {
      nome: 'Ana Silva',
      email: 'mesa@elglobo.com',
      senha: senhaHash,
      role: Role.EMPREGADO_MESA,
      canal: CanalVenda.RESTAURANTE,
    },
  })

  await prisma.user.upsert({
    where: { email: 'balcao@elglobo.com' },
    update: { canal: CanalVenda.RESTAURANTE, role: Role.OPERADOR_BALCAO },
    create: {
      nome: 'Operador Balcão',
      email: 'balcao@elglobo.com',
      senha: senhaHash,
      role: Role.OPERADOR_BALCAO,
      canal: CanalVenda.RESTAURANTE,
    },
  })

  await prisma.user.upsert({
    where: { email: 'bottlestore@elglobo.com' },
    update: { canal: CanalVenda.BOTTLESTORE },
    create: {
      nome: 'Carlos Loja',
      email: 'bottlestore@elglobo.com',
      senha: senhaHash,
      role: Role.OPERADOR_BOTTLESTORE,
      canal: CanalVenda.BOTTLESTORE,
    },
  })

  await prisma.user.upsert({
    where: { email: 'cozinha@elglobo.com' },
    update: { canal: CanalVenda.RESTAURANTE },
    create: {
      nome: 'Pedro Cozinha',
      email: 'cozinha@elglobo.com',
      senha: senhaHash,
      role: Role.COZINHEIRO,
      canal: CanalVenda.RESTAURANTE,
    },
  })

  // Gestor de inventário POR CANAL — vê apenas o stock do seu canal
  // (RESTAURANTE inclui PISCINA), sem acesso a vendas, caixas, mesas,
  // abas nem dashboards financeiros.
  await prisma.user.upsert({
    where: { email: 'gestor@elglobo.com' },
    update: { role: Role.GESTOR_STOCK, canal: CanalVenda.RESTAURANTE },
    create: {
      nome: 'Gestor de Stock',
      email: 'gestor@elglobo.com',
      senha: senhaHash,
      role: Role.GESTOR_STOCK,
      canal: CanalVenda.RESTAURANTE,
    },
  })

  console.log('✅ Utilizadores criados (admin global + gestores por canal)')

  // ─── Categorias ─────────────────────────────────────────────
  const catBebidaAlcoolica = await prisma.categoria.upsert({
    where: { id: 'cat-bebida-alcoolica' },
    update: {},
    create: {
      id: 'cat-bebida-alcoolica',
      nome: 'Bebidas Alcoólicas',
      tipo: TipoCategoria.BEBIDA_ALCOOLICA,
      icone: 'Wine',
      cor: '#8B5CF6',
    },
  })

  const catBebidaNaoAlcoolica = await prisma.categoria.upsert({
    where: { id: 'cat-bebida-nao-alcoolica' },
    update: {},
    create: {
      id: 'cat-bebida-nao-alcoolica',
      nome: 'Bebidas Não Alcoólicas',
      tipo: TipoCategoria.BEBIDA_NAO_ALCOOLICA,
      icone: 'Coffee',
      cor: '#10B981',
    },
  })

  const catComida = await prisma.categoria.upsert({
    where: { id: 'cat-comida' },
    update: {},
    create: {
      id: 'cat-comida',
      nome: 'Comida',
      tipo: TipoCategoria.COMIDA,
      icone: 'UtensilsCrossed',
      cor: '#F59E0B',
    },
  })

  const catSnack = await prisma.categoria.upsert({
    where: { id: 'cat-snack' },
    update: {},
    create: {
      id: 'cat-snack',
      nome: 'Snacks',
      tipo: TipoCategoria.SNACK,
      icone: 'Package',
      cor: '#EC4899',
    },
  })

  // ─── Subcategorias (hierarquia Pai → Filhas) ─────────────────
  // O `update` inclui o parent para que re-seeds migrem bases antigas.
  async function criarSubcategoria(opts: {
    id: string; nome: string; tipo: TipoCategoria; parentId: string; icone?: string; ordem?: number
  }) {
    return prisma.categoria.upsert({
      where: { id: opts.id },
      update: { parentCategoryId: opts.parentId },
      create: {
        id: opts.id,
        nome: opts.nome,
        tipo: opts.tipo,
        icone: opts.icone,
        ordem: opts.ordem ?? 0,
        parentCategoryId: opts.parentId,
      },
    })
  }

  // Comidas → Entradas, Pratos Principais, Aperitivos
  await criarSubcategoria({ id: 'cat-entradas', nome: 'Entradas', tipo: TipoCategoria.COMIDA, parentId: catComida.id, icone: 'Salad', ordem: 1 })
  const catPratosPrincipais = await criarSubcategoria({ id: 'cat-pratos-principais', nome: 'Pratos Principais', tipo: TipoCategoria.COMIDA, parentId: catComida.id, icone: 'ChefHat', ordem: 2 })
  const catAperitivos = await criarSubcategoria({ id: 'cat-aperitivos', nome: 'Aperitivos', tipo: TipoCategoria.COMIDA, parentId: catComida.id, icone: 'Utensils', ordem: 3 })

  // Bebidas Alcoólicas → Cervejas, Vinhos, Whiskies
  const catCervejas = await criarSubcategoria({ id: 'cat-cervejas', nome: 'Cervejas', tipo: TipoCategoria.BEBIDA_ALCOOLICA, parentId: catBebidaAlcoolica.id, icone: 'Beer', ordem: 1 })
  await criarSubcategoria({ id: 'cat-vinhos', nome: 'Vinhos', tipo: TipoCategoria.BEBIDA_ALCOOLICA, parentId: catBebidaAlcoolica.id, icone: 'Wine', ordem: 2 })
  await criarSubcategoria({ id: 'cat-whiskies', nome: 'Whiskies', tipo: TipoCategoria.BEBIDA_ALCOOLICA, parentId: catBebidaAlcoolica.id, icone: 'GlassWater', ordem: 3 })

  // Bebidas Não Alcoólicas → Sumos, Refrescos
  const catSumos = await criarSubcategoria({ id: 'cat-sumos', nome: 'Sumos', tipo: TipoCategoria.BEBIDA_NAO_ALCOOLICA, parentId: catBebidaNaoAlcoolica.id, icone: 'CupSoda', ordem: 1 })
  const catRefrescos = await criarSubcategoria({ id: 'cat-refrescos', nome: 'Refrescos', tipo: TipoCategoria.BEBIDA_NAO_ALCOOLICA, parentId: catBebidaNaoAlcoolica.id, icone: 'GlassWater', ordem: 2 })

  console.log('✅ Categorias criadas (pais + subcategorias)')

  // ─── Produtos ───────────────────────────────────────────────
  // Nota de negócio: o restaurante vende MAIS CARO que a bottlestore.

  await criarProduto({
    sku: 'VOD-ABS-750',
    nome: 'Vodka Absolut 750ml',
    codigoBarras: '7312040017014',
    categoriaId: catBebidaAlcoolica.id,
    unidadeMedida: UnidadeMedida.UNIDADE,
    stocks: {
      RESTAURANTE: { preco: 45.0, custo: 20.0, stock: 6, min: 2 },
      BOTTLESTORE: { preco: 28.5, custo: 20.0, stock: 18, min: 6 },
    },
  })

  const vodkaBar = await criarProduto({
    sku: 'VOD-ABS-BAR',
    nome: 'Vodka Absolut (Bar - Litros)',
    categoriaId: catBebidaAlcoolica.id,
    unidadeMedida: UnidadeMedida.LITRO,
    stocks: {
      RESTAURANTE: { preco: 0, stock: 3, min: 1 },
    },
  })

  const aguaTonica = await criarProduto({
    sku: 'TON-SCH-200',
    nome: 'Água Tónica Schweppes 200ml',
    codigoBarras: '5449000133328',
    categoriaId: catRefrescos.id,
    unidadeMedida: UnidadeMedida.UNIDADE,
    stocks: {
      RESTAURANTE: { preco: 4.0, custo: 1.2, stock: 24, min: 6 },
      BOTTLESTORE: { preco: 2.5, custo: 1.2, stock: 24, min: 12 },
      PISCINA: { preco: 4.5, custo: 1.2, stock: 12, min: 6 },
    },
  })

  // ─── Exemplo Caixa → Unidade (auto-unboxing) ────────────────
  // A caixa é o produto "pai"; a garrafa é o "filho" com fatorConversao.
  const cervejaCaixa = await criarProduto({
    sku: 'CER-DOS-CX24',
    nome: 'Cerveja Dos M — Caixa 24×330ml',
    codigoBarras: '5601023000029',
    categoriaId: catCervejas.id,
    unidadeMedida: UnidadeMedida.UNIDADE,
    stocks: {
      BOTTLESTORE: { preco: 72.0, custo: 55.0, stock: 10, min: 2 },
      RESTAURANTE: { preco: 0, custo: 55.0, stock: 4, min: 1 }, // armazém do restaurante
    },
  })

  await criarProduto({
    sku: 'CER-DOS-330',
    nome: 'Cerveja Dos M 330ml',
    descricao: 'Cerveja moçambicana leve e refrescante, garrafa 330ml.',
    codigoBarras: '5601023000012',
    categoriaId: catCervejas.id,
    unidadeMedida: UnidadeMedida.UNIDADE,
    parentProductId: cervejaCaixa.id,
    fatorConversao: 24,
    stocks: {
      RESTAURANTE: { preco: 5.0, custo: 2.3, stock: 36, min: 15 },
      BOTTLESTORE: { preco: 3.5, custo: 2.3, stock: 24, min: 15 },
      PISCINA: { preco: 5.5, custo: 2.3, stock: 24, min: 12 },
    },
  })

  await criarProduto({
    sku: 'SUM-NAT-300',
    nome: 'Sumo Natural Laranja 300ml',
    descricao: 'Sumo de laranja espremido na hora.',
    categoriaId: catSumos.id,
    unidadeMedida: UnidadeMedida.UNIDADE,
    stocks: {
      RESTAURANTE: { preco: 4.5, stock: 30, min: 10 },
      PISCINA: { preco: 5.0, stock: 20, min: 5 },
    },
  })

  await criarProduto({
    sku: 'COM-BIF-001',
    nome: 'Bifana no Pão',
    descricao: 'Bifana de porco marinada, servida no pão com molho da casa.',
    categoriaId: catAperitivos.id,
    unidadeMedida: UnidadeMedida.PORCAO,
    stocks: {
      RESTAURANTE: { preco: 8.0, stock: 30, min: 5 },
      PISCINA: { preco: 9.0, stock: 30, min: 5 },
    },
  })

  await criarProduto({
    sku: 'COM-FRA-001',
    nome: 'Francesinha Especial',
    descricao: 'Francesinha com molho especial, ovo e batata frita.',
    categoriaId: catPratosPrincipais.id,
    unidadeMedida: UnidadeMedida.PORCAO,
    stocks: {
      RESTAURANTE: { preco: 16.5, stock: 20, min: 3 },
    },
  })

  await criarProduto({
    sku: 'SNK-BAT-001',
    nome: 'Batatas Fritas (porção)',
    categoriaId: catSnack.id,
    unidadeMedida: UnidadeMedida.PORCAO,
    stocks: {
      RESTAURANTE: { preco: 5.0, stock: 40, min: 10 },
      PISCINA: { preco: 6.0, stock: 40, min: 10 },
    },
  })

  console.log('✅ Produtos criados (com preços por canal + par caixa/unidade)')

  // ─── Fichas Técnicas (Receitas do Bar) ───────────────────────
  await prisma.fichaTecnica.upsert({
    where: { id: 'ft-vodka-tonica' },
    update: {},
    create: {
      id: 'ft-vodka-tonica',
      nome: 'Vodka Tónica',
      descricao: '50ml Vodka + Tónica',
      precoVenda: 7.0,
    },
  })

  await prisma.fichaTecnicaItem.deleteMany({
    where: { fichaTecnicaId: 'ft-vodka-tonica' },
  })

  await prisma.fichaTecnicaItem.createMany({
    data: [
      {
        fichaTecnicaId: 'ft-vodka-tonica',
        produtoId: vodkaBar.id,
        quantidade: 0.05, // 50ml = 0.05 litros
        unidade: UnidadeMedida.LITRO,
      },
      {
        fichaTecnicaId: 'ft-vodka-tonica',
        produtoId: aguaTonica.id,
        quantidade: 1,
        unidade: UnidadeMedida.UNIDADE,
      },
    ],
  })

  console.log('✅ Fichas Técnicas criadas')

  // ─── Mesas ───────────────────────────────────────────────────
  const mesasData = [
    // Interior
    { numero: 1, zona: 'Interior', posX: 15, posY: 20, lugares: 2 },
    { numero: 2, zona: 'Interior', posX: 30, posY: 20, lugares: 4 },
    { numero: 3, zona: 'Interior', posX: 45, posY: 20, lugares: 4 },
    { numero: 4, zona: 'Interior', posX: 60, posY: 20, lugares: 6 },
    { numero: 5, zona: 'Interior', posX: 15, posY: 55, lugares: 4 },
    { numero: 6, zona: 'Interior', posX: 30, posY: 55, lugares: 4 },
    { numero: 7, zona: 'Interior', posX: 45, posY: 55, lugares: 2 },
    // Esplanada
    { numero: 8, zona: 'Esplanada', posX: 15, posY: 20, lugares: 4 },
    { numero: 9, zona: 'Esplanada', posX: 35, posY: 20, lugares: 4 },
    { numero: 10, zona: 'Esplanada', posX: 55, posY: 20, lugares: 6 },
    { numero: 11, zona: 'Esplanada', posX: 75, posY: 20, lugares: 2 },
    { numero: 12, zona: 'Esplanada', posX: 25, posY: 60, lugares: 4 },
    { numero: 13, zona: 'Esplanada', posX: 55, posY: 60, lugares: 4 },
    // Bar
    { numero: 14, zona: 'Bar', posX: 20, posY: 30, lugares: 2 },
    { numero: 15, zona: 'Bar', posX: 40, posY: 30, lugares: 2 },
    { numero: 16, zona: 'Bar', posX: 60, posY: 30, lugares: 2 },
  ]

  for (const mesa of mesasData) {
    await prisma.mesa.upsert({
      where: { numero: mesa.numero },
      update: {},
      create: mesa,
    })
  }

  console.log('✅ Mesas criadas (16 mesas em 3 zonas)')

  // ─── Configurações ───────────────────────────────────────────
  const configs = [
    { chave: 'nome_estabelecimento', valor: 'EL Globo', tipo: 'string' },
    { chave: 'moeda', valor: 'MZN', tipo: 'string' },
    { chave: 'moeda_simbolo', valor: 'MT', tipo: 'string' },
    { chave: 'iva_percentagem', valor: '17', tipo: 'number' },
    { chave: 'impressao_termica_ativa', valor: 'false', tipo: 'boolean' },
    { chave: 'impressora_ip', valor: '192.168.1.100', tipo: 'string' },
    { chave: 'impressora_porta', valor: '9100', tipo: 'number' },
  ]

  for (const config of configs) {
    await prisma.configuracao.upsert({
      where: { chave: config.chave },
      update: {},
      create: config,
    })
  }

  console.log('✅ Configurações criadas')
  console.log('')
  console.log('═══════════════════════════════════════')
  console.log('🎉 Seed concluído com sucesso!')
  console.log('═══════════════════════════════════════')
  console.log('')
  console.log('Credenciais de Acesso:')
  console.log('  Admin (global):        admin@elglobo.com / elglobo123')
  console.log('  Gerente Restaurante:   gerente@elglobo.com / elglobo123')
  console.log('  Gerente Bottlestore:   gerente.loja@elglobo.com / elglobo123')
  console.log('  Empregado Mesa:        mesa@elglobo.com / elglobo123')
  console.log('  Operador Balcão:       balcao@elglobo.com / elglobo123')
  console.log('  Operador Bottlestore:  bottlestore@elglobo.com / elglobo123')
  console.log('  Cozinheiro:            cozinha@elglobo.com / elglobo123')
  console.log('  Gestor de Stock:       gestor@elglobo.com / elglobo123')
  console.log('')
}

main()
  .catch((e) => {
    console.error('❌ Erro no seed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
