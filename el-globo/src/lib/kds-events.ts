// Hub de eventos SSE partilhado entre rotas (KDS, empregados de mesa).
// route.ts só pode exportar handlers HTTP no Next.js — por isso o estado
// e a função de broadcast vivem aqui. Usa globalThis para sobreviver ao
// HMR em desenvolvimento (mesmo padrão do prisma.ts).

type SSEController = ReadableStreamDefaultController

const globalForKDS = globalThis as unknown as {
  __kdsClients: Set<SSEController> | undefined
}

export const kdsClients: Set<SSEController> =
  globalForKDS.__kdsClients ?? (globalForKDS.__kdsClients = new Set())

const encoder = new TextEncoder()

export type KDSEvento =
  | { tipo: 'NOVO_PEDIDO'; pedido: unknown }
  | { tipo: 'ATUALIZAR_PEDIDO'; pedido: unknown }
  // origemPreparo: secção que acabou de terminar os seus itens
  // (COZINHA ou BAR) — permite ao ProntoAlert dizer o que está pronto.
  // Ausente em eventos antigos/globais (pedido inteiro pronto).
  | { tipo: 'PEDIDO_PRONTO'; pedido: unknown; origemPreparo?: 'COZINHA' | 'BAR' }
  | { tipo: 'REMOVER_PEDIDO'; pedidoId: string }

export function notifyKDSClients(data: KDSEvento) {
  const msg = encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
  kdsClients.forEach(ctrl => {
    try {
      ctrl.enqueue(msg)
    } catch {
      kdsClients.delete(ctrl)
    }
  })
}
