export interface DriveFile {
  id: string
  name: string
  mimeType: string
  size?: number
  modifiedTime: string
  webViewLink?: string
  webContentLink?: string
  parents?: string[]
  content?: string // Extracted text content
}

export interface Embedding {
  fileId: string
  fileName: string
  content: string
  vector: number[]
  mimeType: string
  webViewLink?: string
  chunkIndex?: number // For large files split into chunks
  metadata: {
    size?: number
    modifiedTime: string
    extractedAt: string
  }
}

export interface EmbeddingMatch {
  embedding: Embedding
  similarity: number
  relevance: 'high' | 'medium' | 'low'
}

export interface VectorSearchQuery {
  query: string
  queryVector: number[]
  limit?: number
  similarityThreshold?: number
}

export interface VectorSearchResult {
  matches: EmbeddingMatch[]
  totalMatches: number
  searchTime: number
}

export interface EmbeddingsFile {
  version: string
  generatedAt: string
  totalFiles: number
  embeddings: Embedding[]
  metadata: {
    openaiModel: string
    embeddingDimension: number
  }
}

export interface EmbeddingGenerationProgress {
  current: number
  total: number
  currentFile: string
  status: 'processing' | 'complete' | 'error'
  error?: string
}

export interface Citation {
  fileName: string
  fileId: string
  webViewLink?: string
} 