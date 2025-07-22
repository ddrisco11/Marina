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
  return match?.[1] ?? null
}

export async function GET(req: NextRequest) {
  try {
    console.log('GET /api/embeddings: Starting request')
    
    const accessToken = getAccessToken(req)
    if (!accessToken) {
      console.log('GET /api/embeddings: Missing access token')
      return NextResponse.json({ error: 'Missing access token' }, { status: 401 })
    }

    console.log('GET /api/embeddings: Access token present:', {
      length: accessToken.length,
      preview: accessToken.substring(0, 20) + '...'
    })

    console.log('GET /api/embeddings: Searching for embeddings file...')
    const found = await searchEmbeddingsFile(accessToken)
    if (!found) {
      console.log('GET /api/embeddings: No embeddings file found')
      return NextResponse.json({ embeddings: null }, { status: 404 })
    }

    console.log('GET /api/embeddings: Found embeddings file, downloading...')
    const file = await downloadEmbeddingsFile(accessToken, found.id)
    console.log('GET /api/embeddings: Successfully downloaded embeddings file with', file.embeddings.length, 'embeddings')
    
    return NextResponse.json({ embeddings: file.embeddings })
  } catch (err: any) {
    console.error('GET /api/embeddings error details:', {
      message: err.message,
      name: err.name,
      stack: err.stack,
      response: err.response?.data,
      status: err.response?.status,
      statusText: err.response?.statusText,
      code: err.code
    })
    
    // Return more specific error messages
    let errorMessage = err.message || 'Failed to load embeddings'
    let statusCode = 500
    
    if (err.message?.includes('Authentication failed') || err.message?.includes('Invalid or expired access token')) {
      statusCode = 401
      errorMessage = 'Authentication failed. Please sign out and sign in again.'
    } else if (err.message?.includes('Permission denied')) {
      statusCode = 403
      errorMessage = 'Permission denied. Please ensure your Google account has access to Google Drive.'
    }
    
    return NextResponse.json(
      { 
        error: errorMessage,
        details: {
          originalError: err.message,
          timestamp: new Date().toISOString(),
          endpoint: 'GET /api/embeddings'
        }
      },
      { status: statusCode }
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
              const batch = await generateEmbeddingsBatch([{ ...file, content }])
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