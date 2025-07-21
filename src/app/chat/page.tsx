'use client'

import { useSession } from 'next-auth/react'
import { useEffect, useState, useRef } from 'react'
import type { Embedding, Citation } from '@/types/embeddings'
import type { ChatMessage as Message } from '@/types/chat'

interface EmbeddingProgress {
  current: number
  total: number
  fileName?: string
  status?: string
  error?: string
}

export default function ChatPage() {
  const { data: session, status } = useSession()
  const [embeddings, setEmbeddings] = useState<Embedding[] | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [inputValue, setInputValue] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [isTyping, setIsTyping] = useState(false)
  const [streamedResponse, setStreamedResponse] = useState('')
  const [currentCitations, setCurrentCitations] = useState<Citation[]>([])
  const [embeddingProgress, setEmbeddingProgress] = useState<EmbeddingProgress | null>(null)
  const [embeddingTotal, setEmbeddingTotal] = useState<number | null>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)

  // Scroll to bottom on new message
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamedResponse])

  // Load or create embeddings on mount
  useEffect(() => {
    const loadEmbeddings = async () => {
      if (!session?.accessToken) {
        setError('Please sign in to use this feature')
        setIsLoading(false)
        return
      }

      setIsLoading(true)
      setError(null)
      setEmbeddingProgress(null)
      setEmbeddingTotal(null)

      try {
        // Try to load embeddings
        const res = await fetch('/api/embeddings', {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
            'Cache-Control': 'no-store',
            Pragma: 'no-cache',
          },
        })

        const data = await res.json()

        if (res.status === 401) {
          setError('Session expired. Please sign in again.')
          setIsLoading(false)
          return
        }

        if (res.status === 404) {
          // Not found, create embeddings with streaming progress
          const response = await fetch('/api/embeddings', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${session.accessToken}`,
              'Cache-Control': 'no-store',
              Pragma: 'no-cache',
            },
          })

          if (!response.ok) {
            const errorData = await response.json()
            throw new Error(errorData.error || 'Failed to create embeddings')
          }

          if (!response.body) throw new Error('No response body')
          const reader = response.body.getReader()
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
                    setEmbeddingTotal(data.toEmbed)
                    setEmbeddingProgress({ current: 0, total: data.toEmbed })
                  } else if (event === 'progress') {
                    setEmbeddingProgress({ current: data.current, total: data.total, fileName: data.fileName })
                  } else if (event === 'error') {
                    setError(data.error || 'Embedding error')
                    setIsLoading(false)
                    setEmbeddingProgress(null)
                    return
                  } else if (event === 'complete') {
                    setEmbeddingProgress(null)
                    setIsLoading(false)
                    // After complete, fetch embeddings again
                    const finalRes = await fetch('/api/embeddings', {
                      method: 'GET',
                      headers: {
                        Authorization: `Bearer ${session.accessToken}`,
                        'Cache-Control': 'no-store',
                        Pragma: 'no-cache',
                      },
                    })
                    if (!finalRes.ok) {
                      throw new Error('Failed to load embeddings after creation')
                    }
                    const finalData = await finalRes.json()
                    setEmbeddings(finalData.embeddings)
                    return
                  }
                } catch (err) {
                  console.error('Error parsing SSE data:', err)
                  setError('Failed to process embedding progress')
                  setIsLoading(false)
                  setEmbeddingProgress(null)
                  return
                }
              }
              buffer = buffer.slice(lastIndex)
            }
            done = streamDone
          }
        } else if (res.ok) {
          setEmbeddings(data.embeddings)
        } else {
          throw new Error(data.error || 'Failed to load embeddings')
        }
        setIsLoading(false)
      } catch (err: any) {
        console.error('Error loading embeddings:', err)
        setError(err.message || 'Failed to load embeddings')
        setIsLoading(false)
      }
    }

    if (status === 'authenticated') {
      loadEmbeddings()
    }
  }, [session, status])

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

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session?.accessToken}`,
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
          Pragma: 'no-cache',
        },
        body: JSON.stringify({ question: userMessage.content }),
      })
      if (!res.body) throw new Error('No response body')
      const reader = res.body.getReader()
      let fullResponse = ''
      let citations: Citation[] = []
      let done = false
      while (!done) {
        const { value, done: streamDone } = await reader.read()
        if (value) {
          const chunk = new TextDecoder().decode(value)
          if (chunk.includes('[[CITATIONS]]')) {
            const [text, citationJson] = chunk.split('[[CITATIONS]]')
            if (text) {
              fullResponse += text
              setStreamedResponse(fullResponse)
            }
            if (citationJson) {
              try {
                citations = JSON.parse(citationJson)
                setCurrentCitations(citations)
              } catch {}
            }
          } else if (chunk.startsWith('[ERROR]')) {
            setError(chunk.replace('[ERROR]', ''))
            setIsTyping(false)
            setStreamedResponse('')
            done = true
            break
          } else {
            fullResponse += chunk
            setStreamedResponse(fullResponse)
          }
        }
        done = streamDone
      }
      setIsTyping(false)
      setMessages(prev => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          content: fullResponse,
          role: 'assistant',
          timestamp: new Date(),
          citations: citations.map(c => ({
            fileId: c.fileId,
            fileName: c.fileName,
            webViewLink: c.webViewLink,
            relevance: 'high',
            similarity: 1,
          })),
        } as Message,
      ])
      setStreamedResponse('')
    } catch (err: any) {
      setIsTyping(false)
      setStreamedResponse('')
      setError(err.message || 'Failed to get AI response')
    }
  }

  if (status === 'loading') return <div className="p-8">Loading...</div>
  if (status === 'unauthenticated') return <div className="p-8">Please sign in to use the chat.</div>
  if (isLoading && embeddingProgress) {
    return (
      <div className="p-8">
        <div className="mb-2">Indexing your Drive files...</div>
        <div className="mb-2">{embeddingProgress.fileName ? `Processing: ${embeddingProgress.fileName}` : ''}</div>
        <div className="w-full bg-gray-200 rounded-full h-4 mb-2">
          <div
            className="bg-blue-600 h-4 rounded-full"
            style={{ width: `${((embeddingProgress.current / (embeddingProgress.total || 1)) * 100).toFixed(1)}%` }}
          />
        </div>
        <div>{embeddingProgress.current} / {embeddingProgress.total} files embedded</div>
      </div>
    )
  }
  if (isLoading) return <div className="p-8">Loading your Drive embeddings...</div>
  if (error) return <div className="p-8 text-red-500">Error: {error}</div>
  if (!embeddings) return <div className="p-8">No embeddings loaded.</div>

  return (
    <div className="max-w-2xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Chat</h1>
      <div className="border rounded p-4 h-96 overflow-y-auto bg-white mb-4">
        {messages.map((msg) => (
          <div key={msg.id} className={`mb-2 ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
            <div className={`inline-block px-3 py-2 rounded ${msg.role === 'user' ? 'bg-blue-100' : 'bg-gray-100'}`}>{msg.content}</div>
            {msg.role === 'assistant' && msg.citations && msg.citations.length > 0 && (
              <div className="text-xs text-gray-500 mt-1">
                Citations:{' '}
                {msg.citations.map((c: Citation, i: number) => (
                  <span key={c.fileId}>
                    <a href={c.webViewLink || `https://drive.google.com/file/d/${c.fileId}/view`} target="_blank" rel="noopener noreferrer" className="underline">
                      {c.fileName}
                    </a>
                    {i < msg.citations!.length - 1 ? ', ' : ''}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
        {streamedResponse && (
          <div className="mb-2 text-left">
            <div className="inline-block px-3 py-2 rounded bg-gray-100 animate-pulse">{streamedResponse}</div>
            {currentCitations.length > 0 && (
              <div className="text-xs text-gray-500 mt-1">
                Citations:{' '}
                {currentCitations.map((c: Citation, i: number) => (
                  <span key={c.fileId}>
                    <a href={c.webViewLink || `https://drive.google.com/file/d/${c.fileId}/view`} target="_blank" rel="noopener noreferrer" className="underline">
                      {c.fileName}
                    </a>
                    {i < currentCitations.length - 1 ? ', ' : ''}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
        <div ref={chatEndRef} />
      </div>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          className="flex-1 border rounded px-3 py-2"
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          placeholder="Ask about your Drive files..."
          disabled={isTyping}
        />
        <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded" disabled={isTyping || !inputValue.trim()}>
          {isTyping ? '...' : 'Send'}
        </button>
      </form>
    </div>
  )
} 