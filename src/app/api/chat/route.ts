import { NextRequest, NextResponse } from 'next/server'
import { generateEmbedding } from '@/lib/openai/embeddings'
import { performSimilaritySearch } from '@/lib/embeddings/similarity-search'
import { streamChatCompletion } from '@/lib/openai/streaming-chat'
import { searchEmbeddingsFile, downloadEmbeddingsFile } from '@/lib/google-drive/client'
import type { Citation } from '@/types/embeddings'

function getAccessToken(req: NextRequest): string | null {
  const authHeader = req.headers.get('authorization')
  if (authHeader === null || authHeader === undefined) return null
  const match = authHeader.match(/^Bearer (.+)$/)
  return match?.[1] ?? null
}

export async function POST(req: NextRequest) {
  try {
    const accessToken = getAccessToken(req)
    if (!accessToken) {
      return NextResponse.json({ error: 'Missing access token' }, { status: 401 })
    }

    // Parse request body
    const body = await req.json()
    const { question } = body
    if (!question) {
      return NextResponse.json({ error: 'Missing question' }, { status: 400 })
    }

    // Load embeddings
    const found = await searchEmbeddingsFile(accessToken)
    if (!found) {
      return NextResponse.json({ error: 'No embeddings found. Please wait for indexing to complete.' }, { status: 404 })
    }

    const embeddingsFile = await downloadEmbeddingsFile(accessToken, found.id)
    const embeddings = embeddingsFile.embeddings

    // Generate embedding for question
    const questionEmbedding = await generateEmbedding(question)

    // Perform vector search
    const searchResults = await performSimilaritySearch(embeddings, {
      query: question,
      queryVector: questionEmbedding.vector,
      limit: 5,
      similarityThreshold: 0.5,
    })

    // Prepare context and citations
    const contextDocs = searchResults.matches.map(match => 
      `File: ${match.embedding.fileName}\nContent: ${match.embedding.content}`
    )
    const citations: Citation[] = searchResults.matches.map(match => ({
      fileId: match.embedding.fileId,
      fileName: match.embedding.fileName,
      ...(match.embedding.webViewLink ? { webViewLink: match.embedding.webViewLink } : {}),
    }))

    // Stream chat completion with context
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        let fullResponse = ''
        await streamChatCompletion({
          userPrompt: question,
          contextDocs,
          onToken: (token) => {
            fullResponse += token
            controller.enqueue(encoder.encode(token))
          },
          onDone: () => {
            // Send citations at the end
            controller.enqueue(encoder.encode(`\n[[CITATIONS]]${JSON.stringify(citations)}`))
            controller.close()
          },
          onError: (err) => {
            controller.enqueue(encoder.encode(`[ERROR]${err.message || 'Chat error'}`))
            controller.close()
          },
        })
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
        'Connection': 'keep-alive',
      },
    })
  } catch (err: any) {
    console.error('Chat API error:', err)
    return NextResponse.json(
      { error: err.message || 'Failed to process chat request' },
      { status: 500 }
    )
  }
} 