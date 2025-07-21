import type { EmbeddingMatch } from './embeddings'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Date
  citations?: Citation[]
  metadata?: {
    model?: string
    finishReason?: string
    usage?: {
      promptTokens: number
      completionTokens: number
      totalTokens: number
    }
  }
}

export interface Citation {
  fileId: string
  fileName: string
  webViewLink?: string
  relevance: 'high' | 'medium' | 'low'
  similarity: number
  excerpt?: string // Relevant text excerpt
}

export interface ChatStreamChunk {
  id: string
  content: string
  isComplete: boolean
  citations?: Citation[]
  error?: string
}

export interface ChatRequest {
  messages: ChatMessage[]
  query: string
  useRAG?: boolean
  stream?: boolean
  model?: 'gpt-4-turbo' | 'gpt-4' | 'gpt-3.5-turbo'
}

export interface ChatResponse {
  message: ChatMessage
  citations: Citation[]
  searchResults?: EmbeddingMatch[]
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

export interface ChatContext {
  messages: ChatMessage[]
  isLoading: boolean
  error?: string
  sendMessage: (content: string) => Promise<void>
  clearChat: () => void
  regenerateLastMessage: () => Promise<void>
}

export interface ChatSettings {
  model: 'gpt-4-turbo' | 'gpt-4' | 'gpt-3.5-turbo'
  temperature: number
  maxTokens: number
  useRAG: boolean
  citationThreshold: number
} 