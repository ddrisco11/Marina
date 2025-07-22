'use client'

import { useSession } from 'next-auth/react'
import { useEffect, useState, useRef } from 'react'
import type { Embedding } from '@/types/embeddings'
import type { Citation as EmbeddingsCitation } from '@/types/embeddings'
import type { ChatMessage as Message, Citation } from '@/types/chat'

interface EmbeddingProgress {
  current: number
  total: number
  fileName?: string
  status?: string
  error?: string
}

interface DetailedError {
  message: string
  status?: number
  statusText?: string
  headers?: Record<string, string>
  response?: string
  stack?: string
  timestamp: string
}

export default function ChatPage() {
  const { data: session, status } = useSession()
  
  // Enhanced debugging - log every session change
  console.log('🔍 REAL SESSION DEBUG:', {
    status,
    sessionExists: !!session,
    sessionKeys: session ? Object.keys(session) : [],
    accessToken: session?.accessToken ? 'PRESENT' : 'MISSING',
    accessTokenLength: session?.accessToken ? session.accessToken.length : 0,
    error: session?.error,
    fullSession: session
  })
  const [embeddings, setEmbeddings] = useState<Embedding[] | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [detailedError, setDetailedError] = useState<DetailedError | null>(null)
  const [inputValue, setInputValue] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [isTyping, setIsTyping] = useState(false)
  const [streamedResponse, setStreamedResponse] = useState('')
  const [currentCitations, setCurrentCitations] = useState<Citation[]>([])
  const [embeddingProgress, setEmbeddingProgress] = useState<EmbeddingProgress | null>(null)
  const [showDebugPanel, setShowDebugPanel] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  // Helper function to safely parse JSON response
  const safeParseResponse = async (response: Response): Promise<any> => {
    const responseText = await response.text()
    console.log('Raw response:', responseText)
    console.log('Response status:', response.status)
    console.log('Response headers:', Object.fromEntries(response.headers.entries()))
    
    if (!responseText.trim()) {
      throw new Error(`Empty response body (Status: ${response.status} ${response.statusText})`)
    }
    
    try {
      return JSON.parse(responseText)
    } catch (parseError) {
      throw new Error(`Failed to parse JSON response. Status: ${response.status}, Response: "${responseText}", Parse Error: ${parseError instanceof Error ? parseError.message : 'Unknown parse error'}`)
    }
  }

  // Helper function to create detailed error
  const createDetailedError = async (error: any, response?: Response): Promise<DetailedError> => {
    const detailedErr: DetailedError = {
      message: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    }

    if (response) {
      detailedErr.status = response.status
      detailedErr.statusText = response.statusText
      if (response.headers) {
        detailedErr.headers = Object.fromEntries(response.headers.entries())
      }
      
      try {
        const responseText = await response.clone().text()
        detailedErr.response = responseText
      } catch (e) {
        // If reading response fails, that's ok
      }
    }

    if (error instanceof Error && error.stack) {
      detailedErr.stack = error.stack
    }

    console.error('Detailed error created:', detailedErr)
    return detailedErr
  }

  // Load embeddings when access token is available
  useEffect(() => {
    const loadEmbeddings = async () => {
      console.log('Starting to load embeddings...')
      console.log('Session access token present:', !!session?.accessToken)
      console.log('Access token preview:', session?.accessToken?.substring(0, 20) + '...')

      setIsLoading(true)
      setError(null)
      setDetailedError(null)
      setEmbeddingProgress(null)

      try {
        // Try to load embeddings
        console.log('Fetching /api/embeddings (GET)...')
        const res = await fetch('/api/embeddings', {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${session?.accessToken}`,
            'Cache-Control': 'no-store',
            Pragma: 'no-cache',
          },
        })

        console.log('GET response status:', res.status, res.statusText)

        if (res.status === 401) {
          const detailedErr = await createDetailedError(new Error('Session expired. Please sign in again.'), res)
          setDetailedError(detailedErr)
          setError('Session expired. Please sign in again.')
          setIsLoading(false)
          return
        }

        // Handle 404 as "no embeddings found" - this is expected for first-time users
        if (res.status === 404) {
          console.log('No embeddings file found (404), will create new ones...')
          // Fall through to create embeddings via POST
        } else if (!res.ok) {
          // Handle other non-success status codes as actual errors
          const errorData = await safeParseResponse(res)
          const detailedErr = await createDetailedError(new Error(errorData.error || `HTTP ${res.status}`), res)
          setDetailedError(detailedErr)
          setError(errorData.error || `Failed to load embeddings: ${res.status}`)
          setIsLoading(false)
          return
        } else {
          // Success response (200), check if we have embeddings
          const data = await safeParseResponse(res)
          
          if (data.embeddings && data.embeddings.length > 0) {
            console.log('Found existing embeddings:', data.embeddings.length)
            setEmbeddings(data.embeddings)
            setIsLoading(false)
            setError(null)
            return
          }
        }

        // If we reach here, either got 404 or got 200 with no embeddings
        console.log('No embeddings found, creating new ones...')
        setEmbeddingProgress({ current: 0, total: 0, status: 'Creating embeddings...' })
        
        // Create embeddings via POST
        const createRes = await fetch('/api/embeddings', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session?.accessToken}`,
          },
        })

        if (!createRes.ok) {
          const errorData = await safeParseResponse(createRes)
          const detailedErr = await createDetailedError(new Error(errorData.error || `HTTP ${createRes.status}`), createRes)
          setDetailedError(detailedErr)
          setError(errorData.error || `Failed to create embeddings: ${createRes.status}`)
          setIsLoading(false)
          setEmbeddingProgress(null)
          return
        }

        const reader = createRes.body?.getReader()
        if (!reader) {
          const detailedErr = await createDetailedError(new Error('No response stream'))
          setDetailedError(detailedErr)
          setError('No response stream')
          setIsLoading(false)
          setEmbeddingProgress(null)
          return
        }

        let buffer = ''
        let done = false
        while (!done) {
          const { value, done: streamDone } = await reader.read()
          if (value) {
            buffer += new TextDecoder().decode(value)
            // Parse SSE-style events
            const eventRegex = /event: (\w+)\ndata: ([^\n]+)\n\n/g
            let match
            let lastIndex = 0
            while ((match = eventRegex.exec(buffer)) !== null) {
              const [, event, dataStr] = match
              lastIndex = eventRegex.lastIndex
              try {
                const data = JSON.parse(dataStr || '{}')
                if (event === 'start') {
                  setEmbeddingProgress({ current: 0, total: data.toEmbed })
                } else if (event === 'progress') {
                  setEmbeddingProgress({ current: data.current, total: data.total, fileName: data.fileName })
                } else if (event === 'error') {
                  const detailedErr = await createDetailedError(new Error(data.error || 'Embedding error'))
                  setDetailedError(detailedErr)
                  setError(data.error || 'Embedding error')
                  setIsLoading(false)
                  setEmbeddingProgress(null)
                  return
                } else if (event === 'complete') {
                  setEmbeddingProgress(null)
                  setIsLoading(false)
                  // After complete, fetch embeddings again
                  console.log('Embeddings creation complete, fetching final result...')
                  const finalRes = await fetch('/api/embeddings', {
                    method: 'GET',
                    headers: {
                      Authorization: `Bearer ${session?.accessToken}`,
                    },
                  })
                  
                  if (finalRes.ok) {
                    const finalData = await safeParseResponse(finalRes)
                    setEmbeddings(finalData.embeddings || [])
                    setError(null)
                  }
                  return
                }
              } catch (e) {
                console.error('Error parsing SSE data:', e)
              }
            }
            buffer = buffer.slice(lastIndex)
          }
          done = streamDone
        }
      } catch (err: any) {
        console.error('Error in loadEmbeddings:', err)
        if (!detailedError) {
          const detailedErr = await createDetailedError(err)
          setDetailedError(detailedErr)
        }
        setError(err.message || 'Failed to load embeddings')
        setIsLoading(false)
        setEmbeddingProgress(null)
      }
    }

    // Only load embeddings when we have access token
    if (session?.accessToken) {
      loadEmbeddings()
    }
  }, [session?.accessToken]) // Clean dependency array

  // Scroll to bottom on new message
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamedResponse])

  // Real chat logic
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inputValue.trim() || !embeddings) return

    const userMessage: Message = {
      id: Date.now().toString(),
      content: inputValue,
      role: 'user',
      timestamp: new Date(),
    }
    setMessages(prev => [...prev, userMessage])
    setInputValue('')
    setIsTyping(true)
    setStreamedResponse('')
    setCurrentCitations([])
    setError(null)
    setDetailedError(null)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage.content,
          embeddings,
        }),
      })

      if (!res.ok) {
        const errorData = await safeParseResponse(res)
        const detailedErr = await createDetailedError(new Error(errorData.error || `HTTP ${res.status}`), res)
        setDetailedError(detailedErr)
        setError(errorData.error || `Chat service unavailable`)
        setIsTyping(false)
        return
      }

      const reader = res.body?.getReader()
      if (!reader) {
        throw new Error('No response stream')
      }

      let fullResponse = ''
      let citations: Citation[] = []
      
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = new TextDecoder().decode(value)
        
        if (chunk.includes('[[CITATIONS]]')) {
          const [text, citationJson] = chunk.split('[[CITATIONS]]')
          if (text) {
            fullResponse += text
            setStreamedResponse(fullResponse)
          }
          if (citationJson) {
            try {
              const rawCitations: EmbeddingsCitation[] = JSON.parse(citationJson)
              citations = rawCitations.map(c => ({
                fileId: c.fileId,
                fileName: c.fileName,
                ...(c.webViewLink && { webViewLink: c.webViewLink }),
                relevance: 'high' as const,
                similarity: 0.8
              }))
              setCurrentCitations(citations)
            } catch (e) {
              console.error('Error parsing citations:', e)
            }
          }
        } else {
          fullResponse += chunk
          setStreamedResponse(fullResponse)
        }
      }

      // Create final assistant message
      const assistantMessage: Message = {
        id: Date.now().toString(),
        content: fullResponse,
        role: 'assistant',
        timestamp: new Date(),
        citations,
      }
      setMessages(prev => [...prev, assistantMessage])
      setStreamedResponse('')
      setCurrentCitations([])
      setIsTyping(false)
    } catch (err: any) {
      console.error('Error in chat:', err)
      const detailedErr = await createDetailedError(err)
      setDetailedError(detailedErr)
      setError(err.message || 'Failed to send message')
      setIsTyping(false)
    }
  }

  // Enhanced debugging for authentication states
  console.log('🔍 AUTHENTICATION STATE CHECK:', {
    status,
    hasSession: !!session,
    hasAccessToken: !!session?.accessToken,
    hasError: !!session?.error,
    willShowLoadingSpinner: status === 'loading',
    willShowUnauthenticatedError: status === 'unauthenticated', 
    willShowMissingTokenError: status === 'authenticated' && !session?.accessToken
  })

  // Early return guards as specified
  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  if (status === 'unauthenticated') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Please Sign In</h1>
          <p>You need to sign in to access the chat feature.</p>
        </div>
      </div>
    )
  }

  // If authenticated but no access token OR has refresh error, show error banner
  if (status === 'authenticated' && (!session?.accessToken || session?.error)) {
    console.log('🚨 SHOWING ACCESS TOKEN ERROR:', {
      hasAccessToken: !!session?.accessToken,
      hasError: !!session?.error,
      errorType: session?.error
    })
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="container mx-auto px-4 py-8">
          <div className="max-w-4xl mx-auto">
            <div className="mb-6">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">🌊 Marina Chat</h1>
              <p className="text-gray-600">Chat with your Google Drive documents using AI</p>
            </div>
            <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-start">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3 flex-1">
                  <h3 className="text-sm font-medium text-red-800">Error</h3>
                  <p className="mt-1 text-sm text-red-700">
                    {session?.error === 'RefreshAccessTokenError' 
                      ? 'Your session has expired. Please sign in again.' 
                      : 'Please sign in to use this feature'
                    }
                  </p>
                  {session?.error === 'RefreshAccessTokenError' && (
                    <button
                      onClick={() => window.location.href = '/api/auth/signin'}
                      className="mt-2 px-3 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700"
                    >
                      Sign In Again
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Debug logging before render to verify session state
  console.debug('Chat ready:', status, session)

  // Main chat UI - only rendered when authenticated with access token
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">🌊 Marina Chat</h1>
            <p className="text-gray-600">Chat with your Google Drive documents using AI</p>
          </div>

          {/* Embeddings Error Display - ONLY for embeddings-related errors */}
          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-start">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3 flex-1">
                  <h3 className="text-sm font-medium text-red-800">Error</h3>
                  <p className="mt-1 text-sm text-red-700">{error}</p>
                  {detailedError && (
                    <details className="mt-3">
                      <summary className="cursor-pointer text-sm font-medium text-red-800 hover:text-red-900">
                        Show technical details
                      </summary>
                      <div className="mt-2 bg-red-100 rounded p-3 text-xs">
                        <div className="space-y-2">
                          <div>
                            <strong>Timestamp:</strong> {detailedError.timestamp}
                          </div>
                          {detailedError.status && (
                            <div>
                              <strong>HTTP Status:</strong> {detailedError.status} {detailedError.statusText}
                            </div>
                          )}
                          {detailedError.headers && (
                            <div>
                              <strong>Response Headers:</strong>
                              <pre className="mt-1 whitespace-pre-wrap">{JSON.stringify(detailedError.headers, null, 2)}</pre>
                            </div>
                          )}
                          {detailedError.response && (
                            <div>
                              <strong>Response Body:</strong>
                              <pre className="mt-1 whitespace-pre-wrap max-h-40 overflow-y-auto">{detailedError.response}</pre>
                            </div>
                          )}
                          {detailedError.stack && (
                            <div>
                              <strong>Stack Trace:</strong>
                              <pre className="mt-1 whitespace-pre-wrap max-h-40 overflow-y-auto">{detailedError.stack}</pre>
                            </div>
                          )}
                        </div>
                      </div>
                    </details>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Loading or Embedding Progress */}
          {(isLoading || embeddingProgress) && !embeddings && (
            <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600 mr-3"></div>
                <div>
                  {embeddingProgress ? (
                    <div>
                      <p className="text-sm font-medium text-blue-800">Creating embeddings...</p>
                      <p className="text-sm text-blue-600">
                        {embeddingProgress.fileName 
                          ? `Processing ${embeddingProgress.fileName} (${embeddingProgress.current}/${embeddingProgress.total})`
                          : embeddingProgress.status || 'Preparing...'}
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm font-medium text-blue-800">Loading embeddings...</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Chat Interface - ONLY show when embeddings are loaded */}
          {embeddings && !isLoading && (
            <div className="bg-white rounded-lg shadow-md">
              {/* Header */}
              <div className="p-4 border-b bg-gray-50 flex items-center justify-between">
                <div className="text-sm text-gray-600">
                  {embeddings.length} documents indexed
                </div>
                <button
                  onClick={() => setShowDebugPanel(!showDebugPanel)}
                  className="text-xs text-gray-500 hover:text-gray-700 underline"
                >
                  {showDebugPanel ? 'Hide' : 'Show'} Debug Info
                </button>
              </div>

              {/* Messages */}
              <div className="h-96 overflow-y-auto p-4 space-y-4 border-b">
                {messages.length === 0 && !streamedResponse && (
                  <div className="text-center text-gray-500 py-8">
                    <p>Start a conversation about your documents!</p>
                    <p className="text-sm mt-2">I have access to {embeddings.length} indexed documents.</p>
                  </div>
                )}
                
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                        message.role === 'user'
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-200 text-gray-900'
                      }`}
                    >
                      <p className="text-sm">{message.content}</p>
                      {message.citations && message.citations.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-gray-300">
                          <p className="text-xs font-medium mb-1">Sources:</p>
                          {message.citations.map((citation, idx) => (
                            <div key={idx} className="text-xs">
                              {citation.webViewLink ? (
                                <a
                                  href={citation.webViewLink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="hover:underline"
                                >
                                  📄 {citation.fileName}
                                </a>
                              ) : (
                                <span>📄 {citation.fileName}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {/* Streaming response */}
                {streamedResponse && (
                  <div className="flex justify-start">
                    <div className="max-w-xs lg:max-w-md px-4 py-2 rounded-lg bg-gray-200 text-gray-900">
                      <p className="text-sm">{streamedResponse}</p>
                      {currentCitations.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-gray-300">
                          <p className="text-xs font-medium mb-1">Sources:</p>
                          {currentCitations.map((citation, idx) => (
                            <div key={idx} className="text-xs">
                              {citation.webViewLink ? (
                                <a
                                  href={citation.webViewLink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="hover:underline"
                                >
                                  📄 {citation.fileName}
                                </a>
                              ) : (
                                <span>📄 {citation.fileName}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Typing indicator */}
                {isTyping && !streamedResponse && (
                  <div className="flex justify-start">
                    <div className="max-w-xs lg:max-w-md px-4 py-2 rounded-lg bg-gray-200 text-gray-900">
                      <div className="flex items-center space-x-1">
                        <div className="flex space-x-1">
                          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                        </div>
                        <span className="text-xs text-gray-500">Marina is thinking...</span>
                      </div>
                    </div>
                  </div>
                )}
                
                <div ref={chatEndRef} />
              </div>

              {/* Input */}
              <form onSubmit={handleSubmit} className="p-4">
                <div className="flex space-x-2">
                  <input
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder="Ask about your documents..."
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={isTyping}
                    aria-label="Ask about your documents"
                  />
                  <button
                    type="submit"
                    disabled={!inputValue.trim() || isTyping}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Send
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  )
} 