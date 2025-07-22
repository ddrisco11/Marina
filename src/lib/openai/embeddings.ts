import OpenAI from 'openai'
import type { DriveFile, Embedding, EmbeddingGenerationProgress } from '@/types/embeddings'

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

// Configuration constants
const EMBEDDING_MODEL = 'text-embedding-3-small'
const MAX_TOKENS = 8000 // Safe limit for text-embedding-3-small
const CHARS_PER_TOKEN = 4 // Rough estimate

export interface EmbeddingResult {
  vector: number[]
  usage: {
    promptTokens: number
    totalTokens: number
  }
}

/**
 * Truncate text to fit within token limits
 */
function truncateText(text: string, maxTokens: number = MAX_TOKENS): string {
  const maxChars = maxTokens * CHARS_PER_TOKEN
  if (text.length <= maxChars) {
    return text
  }
  
  // Truncate and try to end at a word boundary
  const truncated = text.substring(0, maxChars)
  const lastSpaceIndex = truncated.lastIndexOf(' ')
  
  return lastSpaceIndex > maxChars * 0.9 
    ? truncated.substring(0, lastSpaceIndex)
    : truncated
}

/**
 * Generate embedding for a single text string
 */
export async function generateEmbedding(text: string): Promise<EmbeddingResult> {
  if (!text || text.trim().length === 0) {
    throw new Error('Text content cannot be empty')
  }

  try {
    const truncatedText = truncateText(text)
    
    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: truncatedText,
      encoding_format: 'float',
    })

    const embedding = response.data[0]?.embedding
    if (!embedding) {
      throw new Error('No embedding returned from OpenAI')
    }

    return {
      vector: embedding,
      usage: {
        promptTokens: response.usage?.prompt_tokens ?? 0,
        totalTokens: response.usage?.total_tokens ?? 0,
      },
    }
  } catch (error) {
    throw new Error(`Failed to generate embedding: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Generate embeddings for multiple files with progress tracking
 */
export async function generateEmbeddingsBatch(
  files: DriveFile[],
  onProgress?: (progress: EmbeddingGenerationProgress) => void
): Promise<Embedding[]> {
  const embeddings: Embedding[] = []
  const total = files.length

  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    
    // Skip if file is undefined
    if (!file) continue
    
    // Report progress
    onProgress?.({
      current: i + 1,
      total,
      currentFile: file.name,
      status: 'processing',
    })

    try {
      // Extract text content from file
      const textContent = await extractTextContent(file)
      
      // Skip files without extractable content
      if (!textContent || textContent.trim().length === 0) {
        continue
      }

      // Generate embedding
      const embeddingResult = await generateEmbedding(textContent)
      
      const embedding: Embedding = {
        fileId: file.id,
        fileName: file.name,
        content: textContent,
        vector: embeddingResult.vector,
        mimeType: file.mimeType,
        ...(file.webViewLink && { webViewLink: file.webViewLink }),
        metadata: {
          ...(file.size !== undefined && { size: file.size }),
          modifiedTime: file.modifiedTime,
          extractedAt: new Date().toISOString(),
        },
      }

      embeddings.push(embedding)
      
    } catch (error) {
      // Report error but continue with other files
      onProgress?.({
        current: i + 1,
        total,
        currentFile: file.name,
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  // Report completion
  const lastFile = files[files.length - 1]
  onProgress?.({
    current: total,
    total,
    currentFile: lastFile?.name ?? '',
    status: 'complete',
  })

  return embeddings
}

/**
 * Extract text content from various file types
 */
export async function extractTextContent(file: DriveFile): Promise<string> {
  if (!file.content) {
    return ''
  }

  const { mimeType, content } = file

  try {
    switch (mimeType) {
      case 'text/plain':
      case 'text/markdown':
      case 'text/csv':
        return content

      case 'application/vnd.google-apps.document':
      case 'text/html':
        // Strip HTML tags for Google Docs and HTML files
        return content.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()

      case 'application/pdf':
        // For PDF files, assume content is already extracted text
        // In a real implementation, you'd use a PDF parser library
        return content.replace(/^%PDF.*?\n/, '').trim()

      case 'application/vnd.google-apps.spreadsheet':
      case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
        // For spreadsheets, extract text from cells
        // This is a simplified implementation
        return content.replace(/[,\t]/g, ' ').replace(/\s+/g, ' ').trim()

      case 'application/vnd.google-apps.presentation':
      case 'application/vnd.openxmlformats-officedocument.presentationml.presentation':
        // For presentations, extract text content
        return content.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()

      case 'application/json':
        try {
          // Extract values from JSON
          const jsonData = JSON.parse(content)
          return JSON.stringify(jsonData, null, 2)
        } catch {
          return content
        }

      case 'text/javascript':
      case 'text/typescript':
      case 'application/javascript':
        // For code files, return as-is but clean up
        return content.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '').trim()

      default:
        // For unsupported file types, return empty string
        return ''
    }
  } catch (error) {
    // If extraction fails, return empty string
    return ''
  }
} 