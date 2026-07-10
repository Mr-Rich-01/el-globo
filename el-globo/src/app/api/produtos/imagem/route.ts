import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import sharp from 'sharp'
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'
import crypto from 'crypto'

// Upload de foto de produto para o cardápio digital/POS.
// A imagem é SEMPRE reprocessada no servidor (sharp): WebP, máx. 400×400,
// qualidade reduzida até ficar ≤ ~50KB — o VPS serve milhares de scans
// de QR code por dia e não pode servir fotos de telemóvel de 4MB.
// Guardada em public/uploads/produtos (volume persistente no Docker).

const TAMANHO_MAX_UPLOAD = 10 * 1024 * 1024 // 10MB antes da compressão
const ALVO_BYTES = 50 * 1024
const QUALIDADES = [70, 55, 40, 28]

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session || !['ADMIN', 'GERENTE'].includes(session.role)) {
    return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })
  }

  try {
    const formData = await request.formData()
    const ficheiro = formData.get('ficheiro')
    if (!(ficheiro instanceof File)) {
      return NextResponse.json({ erro: 'Nenhum ficheiro enviado (campo "ficheiro")' }, { status: 400 })
    }
    if (!ficheiro.type.startsWith('image/')) {
      return NextResponse.json({ erro: 'O ficheiro tem de ser uma imagem' }, { status: 400 })
    }
    if (ficheiro.size > TAMANHO_MAX_UPLOAD) {
      return NextResponse.json({ erro: 'Imagem demasiado grande (máx. 10MB)' }, { status: 400 })
    }

    const original = Buffer.from(await ficheiro.arrayBuffer())

    // rotate() aplica a orientação EXIF (fotos de telemóvel vêm deitadas)
    const base = sharp(original).rotate().resize(400, 400, {
      fit: 'inside',
      withoutEnlargement: true,
    })

    let webp: Buffer | null = null
    for (const quality of QUALIDADES) {
      webp = await base.clone().webp({ quality, effort: 4 }).toBuffer()
      if (webp.length <= ALVO_BYTES) break
    }
    if (!webp) {
      return NextResponse.json({ erro: 'Falha ao processar a imagem' }, { status: 500 })
    }

    const nome = `prod_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.webp`
    const pasta = path.join(process.cwd(), 'public', 'uploads', 'produtos')
    await mkdir(pasta, { recursive: true })
    await writeFile(path.join(pasta, nome), webp)

    return NextResponse.json({
      ok: true,
      url: `/uploads/produtos/${nome}`,
      bytes: webp.length,
    }, { status: 201 })
  } catch (error) {
    console.error('Erro no upload de imagem:', error)
    return NextResponse.json({ erro: 'Erro ao processar o upload' }, { status: 500 })
  }
}
