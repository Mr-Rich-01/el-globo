import { NextRequest } from 'next/server'
import { kdsClients } from '@/lib/kds-events'

// Stream SSE partilhado: KDS (cozinha) e ecrãs dos empregados de mesa
// subscrevem aqui. O broadcast é feito via notifyKDSClients (lib/kds-events).

export async function GET(_request: NextRequest) {
  let controller: ReadableStreamDefaultController

  const stream = new ReadableStream({
    start(ctrl) {
      controller = ctrl
      kdsClients.add(ctrl)
      // Heartbeat a cada 15s para manter conexão ativa
      const heartbeat = setInterval(() => {
        try { ctrl.enqueue(new TextEncoder().encode(': ping\n\n')) } catch { clearInterval(heartbeat) }
      }, 15000)
    },
    cancel() {
      kdsClients.delete(controller)
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Para Nginx no VPS
    },
  })
}
