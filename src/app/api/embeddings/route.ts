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

// Configuration for parallel processing
const PARALLEL_PROCESSING_CONFIG = {
  BATCH_SIZE: 5,           // Number of files to process simultaneously
  BATCH_DELAY_MS: 100,     // Delay between batches to prevent API overload
  MAX_RETRIES: 2,          // Number of retries for failed files
}

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
          console.log('🔄 POST /api/embeddings: Starting incremental embeddings process')

          // 1. Get all files from Google Drive
          console.log('📁 Scanning Google Drive files...')
          const files = await scanAllFiles(accessToken)
          console.log(`📁 Found ${files.length} files in Google Drive`)
          
          // 2. Try to load existing embeddings file
          let existingEmbeddings: Embedding[] = []
          let existingEmbeddingsMap = new Map<string, Embedding>()
          
          console.log('🔍 Checking for existing embeddings...')
          const found = await searchEmbeddingsFile(accessToken)
          if (found) {
            console.log('✅ Found existing embeddings file, downloading...')
            const embeddingsFile = await downloadEmbeddingsFile(accessToken, found.id)
            existingEmbeddings = embeddingsFile.embeddings
            existingEmbeddingsMap = new Map(existingEmbeddings.map(e => [e.fileId, e]))
            console.log(`✅ Loaded ${existingEmbeddings.length} existing embeddings`)
          } else {
            console.log('ℹ️ No existing embeddings file found - first time setup')
          }

          // 3. Determine which files need new embeddings (incremental logic)
          console.log('🔄 Determining which files need embedding...')
          const toEmbed = files.filter(file => {
            const existing = existingEmbeddingsMap.get(file.id)
            if (!existing) {
              console.log(`  ➕ ${file.name}: New file (no existing embedding)`)
              return true
            }
            if (existing.metadata?.modifiedTime !== file.modifiedTime) {
              console.log(`  🔄 ${file.name}: Modified since last embedding (${existing.metadata?.modifiedTime} -> ${file.modifiedTime})`)
              return true
            }
            console.log(`  ✅ ${file.name}: Up to date (skipping)`)
            return false
          })

          console.log(`📊 Embedding Summary:`)
          console.log(`  - Total files: ${files.length}`)
          console.log(`  - Existing embeddings: ${existingEmbeddings.length}`)
          console.log(`  - Files to embed: ${toEmbed.length}`)
          console.log(`  - Files to skip: ${files.length - toEmbed.length}`)

          // 4. Stream progress: start
          controller.enqueue(encoder.encode(`event: start\ndata: {"total":${files.length},"toEmbed":${toEmbed.length},"existing":${existingEmbeddings.length}}\n\n`))

          // 5. Download content and embed files in parallel batches
          let embedded: Embedding[] = [...existingEmbeddings]
          let completed = 0
          const { BATCH_SIZE, BATCH_DELAY_MS } = PARALLEL_PROCESSING_CONFIG
          
          console.log(`🚀 Processing ${toEmbed.length} files in batches of ${BATCH_SIZE}`)

          for (let i = 0; i < toEmbed.length; i += BATCH_SIZE) {
            const batch = toEmbed.slice(i, i + BATCH_SIZE)
            console.log(`📦 Processing batch ${Math.floor(i/BATCH_SIZE) + 1}: files ${i + 1}-${Math.min(i + BATCH_SIZE, toEmbed.length)}`)

            // Process all files in the current batch in parallel
            const batchPromises = batch.map(async (file) => {
              if (!file) return { success: false, file, error: 'Invalid file' }

              try {
                console.log(`🔄 Processing: ${file.name}`)
                const content = await downloadFileContent(accessToken, file)
                console.log(`📄 Downloaded content for ${file.name}, length: ${content.length}`)
                
                const embeddingBatch = await generateEmbeddingsBatch([{ ...file, content }])
                const embedding = embeddingBatch?.[0]
                
                if (embedding) {
                  console.log(`✅ Generated embedding for ${file.name}`)
                } else {
                  console.warn(`⚠️ No embedding generated for ${file.name}`)
                }
                
                return {
                  success: true,
                  file,
                  embedding,
                  error: null
                }
              } catch (err: any) {
                console.error(`❌ Error embedding file ${file.name}:`, err.message)
                return {
                  success: false,
                  file,
                  embedding: null,
                  error: err?.message || err?.toString() || 'Unknown error occurred'
                }
              }
            })

            // Wait for all files in this batch to complete
            const batchResults = await Promise.allSettled(batchPromises)

            // Process results and update progress
            for (const result of batchResults) {
              completed++
              
              if (result.status === 'fulfilled') {
                const { success, file, embedding, error } = result.value
                
                if (success && embedding) {
                  // Remove old embedding if exists (for updated files)
                  embedded = embedded.filter(e => e.fileId !== file.id)
                  embedded.push(embedding)
                  
                  // Report success
                  const fileName = file.name.replace(/"/g, '\\"') // Escape quotes
                  const progressEvent = `event: progress\ndata: {"current":${completed},"total":${toEmbed.length},"fileName":"${fileName}","status":"completed"}\n\n`
                  console.log('📤 Sending progress event:', progressEvent.trim())
                  controller.enqueue(encoder.encode(progressEvent))
                } else {
                  // Report error for this specific file
                  const errorMessage = error || 'Unknown error occurred'
                  const fileName = file.name.replace(/"/g, '\\"') // Escape quotes
                  const safeErrorMessage = errorMessage.replace(/"/g, '\\"') // Escape quotes in error message
                  const errorEvent = `event: error\ndata: {"fileName":"${fileName}","error":"${safeErrorMessage}"}\n\n`
                  console.log('⚠️ Sending error event:', errorEvent.trim())
                  controller.enqueue(encoder.encode(errorEvent))
                }
              } else {
                // Promise rejection (should be rare with our error handling)
                const fileName = batch[batchResults.indexOf(result)]?.name || 'Unknown'
                completed++
                console.error(`❌ Promise rejected for file ${fileName}:`, result.reason)
                const rejectionError = result.reason?.message || result.reason?.toString() || 'Promise rejected with unknown reason'
                const safeFileName = fileName.replace(/"/g, '\\"') // Escape quotes
                const safeRejectionError = rejectionError.replace(/"/g, '\\"') // Escape quotes
                const rejectionEvent = `event: error\ndata: {"fileName":"${safeFileName}","error":"Promise rejected: ${safeRejectionError}"}\n\n`
                console.log('⚠️ Sending rejection event:', rejectionEvent.trim())
                controller.enqueue(encoder.encode(rejectionEvent))
              }
            }
            
            // Small delay between batches to prevent overwhelming APIs
            if (i + BATCH_SIZE < toEmbed.length) {
              await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS))
            }
          }

          // 6. Save new embeddings file
          console.log(`💾 Saving embeddings file with ${embedded.length} total embeddings`)
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
          console.log(`✅ Successfully saved embeddings file`)
          
          controller.enqueue(encoder.encode(`event: complete\ndata: {"success":true,"total":${embedded.length},"processed":${toEmbed.length},"existing":${existingEmbeddings.length}}\n\n`))
          controller.close()
        } catch (err: any) {
          console.error('❌ POST /api/embeddings error:', err)
          const errorMessage = err?.message || err?.toString() || 'Failed to create embeddings'
          const safeErrorMessage = errorMessage.replace(/"/g, '\\"') // Escape quotes
          const finalErrorEvent = `event: error\ndata: {"error":"${safeErrorMessage}"}\n\n`
          console.log('❌ Sending final error event:', finalErrorEvent.trim())
          controller.enqueue(encoder.encode(finalErrorEvent))
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
    console.error('❌ POST /api/embeddings outer error:', err)
    return NextResponse.json(
      { error: err.message || 'Failed to create embeddings' },
      { status: 500 }
    )
  }
} 