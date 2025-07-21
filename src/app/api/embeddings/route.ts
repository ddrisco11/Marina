import { NextRequest, NextResponse } from 'next/server'
import {
  searchEmbeddingsFile,
  downloadEmbeddingsFile,
  scanAllFiles,
  downloadFileContent,
  uploadEmbeddingsFile,
} from '@/lib/google-drive/client'
import { generateEmbeddingsBatch } from '@/lib/openai/embeddings'
import type { EmbeddingsFile, Embedding } from '@/types/embeddings'

function getAccessToken(req: NextRequest): string | null {
  const authHeader = req.headers.get('authorization')
  if (!authHeader) return null
  const match = authHeader.match(/^Bearer (.+)$/)
  return match ? match[1] : null
}

export async function GET(req: NextRequest) {
  try {
    const accessToken = getAccessToken(req)
    if (!accessToken) {
      return NextResponse.json({ error: 'Missing access token' }, { status: 401 })
    }

    const found = await searchEmbeddingsFile(accessToken)
    if (!found) {
      return NextResponse.json({ embeddings: null }, { status: 404 })
    }

    const file = await downloadEmbeddingsFile(accessToken, found.id)
    return NextResponse.json({ embeddings: file.embeddings })
  } catch (err: any) {
    console.error('GET /api/embeddings error:', err)
    return NextResponse.json(
      { error: err.message || 'Failed to load embeddings' },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    const accessToken = getAccessToken(req)
    if (!accessToken) {
      return NextResponse.json({ error: 'Missing access token' }, { status: 401 })
    }

    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // 1. Get all files
          const files = await scanAllFiles(accessToken)
          
          // 2. Try to load existing embeddings file
          let existingEmbeddings: Embedding[] = []
          let found = await searchEmbeddingsFile(accessToken)
          if (found) {
            const file = await downloadEmbeddingsFile(accessToken, found.id)
            existingEmbeddings = file.embeddings
          }

          // 3. Determine which files need new embeddings
          const existingMap = new Map(existingEmbeddings.map(e => [e.fileId, e]))
          const toEmbed = files.filter(f => {
            const existing = existingMap.get(f.id)
            return !existing || existing.metadata?.modifiedTime !== f.modifiedTime
          })

          // 4. Stream progress: start
          controller.enqueue(encoder.encode(`event: start\ndata: {"total":${files.length},"toEmbed":${toEmbed.length}}\n\n`))

          // 5. Download content and embed only new/changed files
          let embedded: Embedding[] = [...existingEmbeddings]
          for (let i = 0; i < toEmbed.length; i++) {
            const file = toEmbed[i]
            if (!file) continue

            controller.enqueue(encoder.encode(`event: progress\ndata: {"current":${i+1},"total":${toEmbed.length},"fileName":"${file.name}"}\n\n`))
            
            try {
              const content = await downloadFileContent(accessToken, file)
              const batch = await generateEmbeddingsBatch([{ ...file, content }], 'text-embedding-3-small')
              const embedding = batch?.[0]
              if (embedding) {
                // Remove old embedding if exists
                embedded = embedded.filter(e => e.fileId !== file.id)
                embedded.push(embedding)
              }
            } catch (err: any) {
              console.error(`Error embedding file ${file.name}:`, err)
              controller.enqueue(encoder.encode(`event: error\ndata: {"fileName":"${file.name}","error":"${err.message}"}\n\n`))
            }
          }

          // 6. Save new embeddings file
          const embeddingsFile: EmbeddingsFile = {
            version: '1.0',
            generatedAt: new Date().toISOString(),
            totalFiles: files.length,
            embeddings: embedded,
            metadata: {
              openaiModel: 'text-embedding-3-small',
              embeddingDimension: embedded[0]?.vector.length || 0,
            },
          }

          await uploadEmbeddingsFile(accessToken, embeddingsFile)
          controller.enqueue(encoder.encode(`event: complete\ndata: {"success":true,"total":${embedded.length}}\n\n`))
          controller.close()
        } catch (err: any) {
          console.error('POST /api/embeddings error:', err)
          controller.enqueue(encoder.encode(`event: error\ndata: {"error":"${err.message || 'Failed to create embeddings'}"}\n\n`))
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-store',
        'Connection': 'keep-alive',
      },
    })
  } catch (err: any) {
    console.error('POST /api/embeddings outer error:', err)
    return NextResponse.json(
      { error: err.message || 'Failed to create embeddings' },
      { status: 500 }
    )
  }
} 