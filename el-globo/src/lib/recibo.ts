// Tipos e geração de texto do recibo — partilhado entre o componente
// visual (@media print) e a impressão ESC/POS direta (/api/imprimir).

export interface LinhaRecibo {
  nome: string
  quantidade: number
  precoUnitario: number
}

export interface ParteDivisao {
  parte: number
  valor: number
  itens?: string[]
}

export interface DadosRecibo {
  numero: number
  criadoEm: string | Date
  canalLabel: string        // "Restaurante — Mesa 4", "Piscina — Aba P-12", "Bottlestore"
  operador?: string
  itens: LinhaRecibo[]
  subtotal: number
  desconto: number
  total: number
  metodoPagamento: string
  valorRecebido?: number | null
  troco?: number | null
  divisao?: {
    tipo: 'IGUAL' | 'POR_ITEM'
    partes: number
    detalhe: ParteDivisao[]
  } | null
}

export const METODO_LABEL: Record<string, string> = {
  DINHEIRO: 'Dinheiro',
  CARTAO: 'Cartão',
  MOBILE_MONEY: 'Mobile Money',
  MISTO: 'Misto',
  CREDITO: 'Crédito',
}

const LARGURA = 42 // caracteres numa impressora 80mm (fonte A)

function linha(char = '-') {
  return char.repeat(LARGURA)
}

function parEsqDir(esq: string, dir: string): string {
  const espaco = LARGURA - esq.length - dir.length
  return esq + ' '.repeat(Math.max(1, espaco)) + dir
}

// Impressoras térmicas baratas não têm acentos no charset default —
// normalizar para ASCII evita lixo no talão.
function ascii(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

export function gerarTextoRecibo(d: DadosRecibo, nomeLoja = 'EL GLOBO'): string {
  const data = new Date(d.criadoEm)
  const linhas: string[] = []

  linhas.push(centrar(nomeLoja))
  linhas.push(centrar(ascii(d.canalLabel)))
  linhas.push(centrar(`Recibo Nr ${d.numero}  ${data.toLocaleDateString('pt-PT')} ${data.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}`))
  if (d.operador) linhas.push(centrar(`Operador: ${ascii(d.operador)}`))
  linhas.push(linha('='))

  for (const item of d.itens) {
    const total = (item.precoUnitario * item.quantidade).toFixed(2)
    linhas.push(parEsqDir(ascii(`${item.quantidade}x ${item.nome}`).slice(0, LARGURA - 10), total))
  }

  linhas.push(linha())
  linhas.push(parEsqDir('Subtotal', d.subtotal.toFixed(2)))
  if (d.desconto > 0) linhas.push(parEsqDir('Desconto', `-${d.desconto.toFixed(2)}`))
  linhas.push(parEsqDir('TOTAL MT', d.total.toFixed(2)))
  linhas.push(parEsqDir(`Pagamento: ${METODO_LABEL[d.metodoPagamento] ?? d.metodoPagamento}`, ''))
  if (d.valorRecebido != null) linhas.push(parEsqDir('Recebido', d.valorRecebido.toFixed(2)))
  if (d.troco != null && d.troco > 0) linhas.push(parEsqDir('TROCO', d.troco.toFixed(2)))

  // Divisão de conta — impressa de forma clara no talão
  if (d.divisao && d.divisao.detalhe.length > 0) {
    linhas.push(linha('='))
    linhas.push(centrar('*** CONTA DIVIDIDA ***'))
    linhas.push(centrar(d.divisao.tipo === 'IGUAL'
      ? `${d.divisao.partes}x partes iguais`
      : `Por itens (${d.divisao.partes} pessoas)`))
    for (const parte of d.divisao.detalhe) {
      linhas.push(parEsqDir(`Pessoa ${parte.parte}`, `MT ${parte.valor.toFixed(2)}`))
      if (parte.itens) {
        for (const it of parte.itens) linhas.push('  ' + ascii(it).slice(0, LARGURA - 2))
      }
    }
  }

  linhas.push(linha('='))
  linhas.push(centrar('Obrigado pela sua visita!'))
  linhas.push('')

  return linhas.join('\n')
}

function centrar(s: string): string {
  const pad = Math.max(0, Math.floor((LARGURA - s.length) / 2))
  return ' '.repeat(pad) + s
}
