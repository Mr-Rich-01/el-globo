import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { z } from 'zod'
import { Socket } from 'net'

// Impressão térmica direta via ESC/POS (TCP 9100) + abertura da gaveta.
// Se ENABLE_THERMAL_PRINT=false, devolve { fallback: true } e o cliente
// usa window.print() com o CSS @media print (a gaveta abre via definição
// "abrir gaveta ao imprimir" no driver da impressora).

const ImprimirSchema = z.object({
  texto: z.string().max(10000).optional(),
  abrirGaveta: z.boolean().default(false),
})

// Comandos ESC/POS
const ESC_INIT = Buffer.from([0x1b, 0x40])                    // Reset
const ESC_CORTE = Buffer.from([0x1d, 0x56, 0x42, 0x00])       // Corte parcial
const ESC_GAVETA = Buffer.from([0x1b, 0x70, 0x00, 0x19, 0xfa]) // Kick gaveta (pino 2)

function enviarParaImpressora(payload: Buffer, ip: string, porta: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = new Socket()
    socket.setTimeout(4000)
    socket.on('error', reject)
    socket.on('timeout', () => { socket.destroy(); reject(new Error('Timeout na impressora')) })
    socket.connect(porta, ip, () => {
      socket.write(payload, err => {
        socket.end()
        if (err) reject(err)
        else resolve()
      })
    })
  })
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })

  const ativo = process.env.ENABLE_THERMAL_PRINT === 'true'
  if (!ativo) {
    return NextResponse.json({ ok: false, fallback: true })
  }

  try {
    const body = await request.json()
    const parsed = ImprimirSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ erro: 'Dados inválidos' }, { status: 400 })

    const ip = process.env.THERMAL_PRINTER_IP ?? '192.168.1.100'
    const porta = Number(process.env.THERMAL_PRINTER_PORT ?? 9100)

    const partes: Buffer[] = [ESC_INIT]
    if (parsed.data.abrirGaveta) partes.push(ESC_GAVETA)
    if (parsed.data.texto) {
      partes.push(Buffer.from(parsed.data.texto + '\n\n\n', 'ascii'))
      partes.push(ESC_CORTE)
    }

    await enviarParaImpressora(Buffer.concat(partes), ip, porta)
    return NextResponse.json({ ok: true })
  } catch (error: unknown) {
    const mensagem = error instanceof Error ? error.message : 'Erro na impressão'
    console.error('Erro ao imprimir:', error)
    // Falha de rede na impressora → o cliente faz fallback para window.print()
    return NextResponse.json({ ok: false, fallback: true, erro: mensagem })
  }
}
