import React from 'react'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { useSession } from 'next-auth/react'
import ChatPage from '../../../app/chat/page'

// Mock next-auth
jest.mock('next-auth/react')
const mockUseSession = useSession as jest.MockedFunction<typeof useSession>

// Mock fetch for API calls
const mockFetch = jest.fn()
global.fetch = mockFetch

// Helper to create proper Response mocks
const createMockResponse = (init: {
  ok?: boolean
  status?: number
  statusText?: string
  json?: () => Promise<any>
  text?: () => Promise<string>
  headers?: Record<string, string>
  body?: ReadableStream
}) => ({
  ok: init.ok ?? true,
  status: init.status ?? 200,
  statusText: init.statusText ?? 'OK',
  headers: {
    entries: () => Object.entries(init.headers || {}),
    get: (key: string) => init.headers?.[key] || null
  },
  json: init.json || (() => Promise.resolve({})),
  text: init.text || (() => {
    if (init.json) {
      // If json is provided, return its stringified version
      return init.json().then(data => JSON.stringify(data))
    }
    return Promise.resolve('{}')
  }),
  clone: () => createMockResponse(init),
  body: init.body || null
})

// Mock ReadableStream for streaming responses
const createMockStream = (chunks: string[]) => {
  let index = 0
  return new ReadableStream({
    start(controller) {
      const pushChunk = () => {
        if (index < chunks.length) {
          controller.enqueue(new TextEncoder().encode(chunks[index]))
          index++
          setTimeout(pushChunk, 10) // Simulate async streaming
        } else {
          controller.close()
        }
      }
      pushChunk()
    }
  })
}

describe('ChatPage', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockFetch.mockClear()
  })

  describe('Authentication States', () => {
    it('shows loading spinner when session is loading', () => {
      mockUseSession.mockReturnValue({
        data: null,
        status: 'loading',
        update: jest.fn()
      })

      render(<ChatPage />)
      
      expect(screen.getByText(/loading/i)).toBeInTheDocument()
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    })

    it('shows error banner when unauthenticated', () => {
      mockUseSession.mockReturnValue({
        data: null,
        status: 'unauthenticated',
        update: jest.fn()
      })

      render(<ChatPage />)
      
      expect(screen.getByText(/you need to sign in to access the chat feature/i)).toBeInTheDocument()
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    })

    it('shows error banner when authenticated but no access token', () => {
      mockUseSession.mockReturnValue({
        data: { 
          user: { name: 'Test User' },
          expires: '2024-01-01T00:00:00.000Z'
        },
        status: 'authenticated',
        update: jest.fn()
      })

      render(<ChatPage />)
      
      expect(screen.getByText(/please sign in to use this feature/i)).toBeInTheDocument()
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    })
  })

  describe('Embeddings Loading', () => {
    const mockSession = {
      data: {
        user: { name: 'Test User', email: 'test@example.com' },
        accessToken: 'mock-access-token',
        expires: '2024-01-01T00:00:00.000Z'
      },
      status: 'authenticated' as const,
      update: jest.fn()
    }

    it('loads embeddings when authenticated with access token', async () => {
      mockUseSession.mockReturnValue(mockSession)
      
      const mockEmbeddings = [
        { id: '1', content: 'Test content', metadata: { fileName: 'test.txt' } }
      ]
      
      mockFetch.mockResolvedValueOnce(createMockResponse({
        ok: true,
        json: () => Promise.resolve({ embeddings: mockEmbeddings })
      }))

      render(<ChatPage />)

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith('/api/embeddings', {
          method: 'GET',
          headers: {
            Authorization: 'Bearer mock-access-token',
            'Cache-Control': 'no-store',
            Pragma: 'no-cache'
          }
        })
      })

      await waitFor(() => {
        expect(screen.getByText(/1 documents indexed/i)).toBeInTheDocument()
        expect(screen.getByRole('textbox', { name: /ask about your documents/i })).toBeInTheDocument()
      })
    })

    it('creates embeddings when none exist', async () => {
      mockUseSession.mockReturnValue(mockSession)
      
      // First call returns no embeddings
      mockFetch.mockResolvedValueOnce(createMockResponse({
        ok: true,
        json: () => Promise.resolve({ embeddings: null })
      }))

      // Second call for creating embeddings
      const streamChunks = [
        'event: start\ndata: {"total":5,"toEmbed":3}\n\n',
        'event: progress\ndata: {"current":1,"total":3,"fileName":"test1.txt"}\n\n',
        'event: progress\ndata: {"current":2,"total":3,"fileName":"test2.txt"}\n\n',
        'event: complete\ndata: {"message":"Embeddings created successfully"}\n\n'
      ]

      mockFetch.mockResolvedValueOnce(createMockResponse({
        ok: true,
        body: createMockStream(streamChunks)
      }))

      // Final call to get embeddings after creation
      mockFetch.mockResolvedValueOnce(createMockResponse({
        ok: true,
        json: () => Promise.resolve({
          embeddings: [
            { id: '1', content: 'Test content 1', metadata: { fileName: 'test1.txt' } },
            { id: '2', content: 'Test content 2', metadata: { fileName: 'test2.txt' } }
          ]
        })
      }))

      render(<ChatPage />)

      // Should show final result
      await waitFor(() => {
        expect(screen.getByText(/2 documents indexed/i)).toBeInTheDocument()
      }, { timeout: 1000 })
    })

    it('handles embeddings loading errors gracefully', async () => {
      mockUseSession.mockReturnValue(mockSession)
      
      mockFetch.mockResolvedValueOnce(createMockResponse({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: () => Promise.resolve({ error: 'Authentication failed' })
      }))

      render(<ChatPage />)

      await waitFor(() => {
        expect(screen.getByText(/authentication failed/i)).toBeInTheDocument()
      })
    })
  })

  describe('Chat Functionality', () => {
    const mockSession = {
      data: {
        user: { name: 'Test User', email: 'test@example.com' },
        accessToken: 'mock-access-token',
        expires: '2024-01-01T00:00:00.000Z'
      },
      status: 'authenticated' as const,
      update: jest.fn()
    }

    beforeEach(async () => {
      mockUseSession.mockReturnValue(mockSession)
      
      // Mock successful embeddings load
      mockFetch.mockResolvedValueOnce(createMockResponse({
        ok: true,
        json: () => Promise.resolve({
          embeddings: [
            { id: '1', content: 'Test content', metadata: { fileName: 'test.txt' } }
          ]
        })
      }))
    })

    it('sends messages and displays streaming responses', async () => {
      const streamChunks = [
        'This is a ',
        'streaming ',
        'response ',
        'from the AI.',
        '[[CITATIONS]]',
        '[{"fileId":"1","fileName":"test.txt","webViewLink":"https://example.com"}]'
      ]

      mockFetch.mockResolvedValueOnce(createMockResponse({
        ok: true,
        body: createMockStream(streamChunks)
      }))

      render(<ChatPage />)

      // Wait for embeddings to load
      await waitFor(() => {
        expect(screen.getByRole('textbox')).toBeInTheDocument()
      })

      const input = screen.getByRole('textbox')
      const sendButton = screen.getByRole('button', { name: /send/i })

      // Type a message
      fireEvent.change(input, { target: { value: 'What is this about?' } })
      fireEvent.click(sendButton)

      // Should show user message
      await waitFor(() => {
        expect(screen.getByText('What is this about?')).toBeInTheDocument()
      })

      // Should show streaming AI response
      await waitFor(() => {
        expect(screen.getByText(/this is a streaming response from the ai/i)).toBeInTheDocument()
      }, { timeout: 1000 })

      // Should show citations - look for the file name in the citation format
      await waitFor(() => {
        expect(screen.getByText(/test\.txt/)).toBeInTheDocument()
      })

      // Should call chat API
      expect(mockFetch).toHaveBeenCalledWith('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'What is this about?',
          embeddings: [
            { id: '1', content: 'Test content', metadata: { fileName: 'test.txt' } }
          ]
        })
      })
    })

    it('handles chat API errors gracefully', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: () => Promise.resolve({ error: 'Chat service unavailable' })
      }))

      render(<ChatPage />)

      // Wait for embeddings to load
      await waitFor(() => {
        expect(screen.getByRole('textbox')).toBeInTheDocument()
      })

      const input = screen.getByRole('textbox')
      const sendButton = screen.getByRole('button', { name: /send/i })

      fireEvent.change(input, { target: { value: 'Test message' } })
      fireEvent.click(sendButton)

      await waitFor(() => {
        expect(screen.getAllByText(/chat service unavailable/i)[0]).toBeInTheDocument()
      })
    })

    it('disables input during message sending', async () => {
      const streamChunks = ['Response']
      
      mockFetch.mockResolvedValueOnce(createMockResponse({
        ok: true,
        body: createMockStream(streamChunks)
      }))

      render(<ChatPage />)

      // Wait for embeddings to load
      await waitFor(() => {
        expect(screen.getByRole('textbox')).toBeInTheDocument()
      })

      const input = screen.getByRole('textbox')
      const sendButton = screen.getByRole('button', { name: /send/i })

      fireEvent.change(input, { target: { value: 'Test message' } })
      fireEvent.click(sendButton)

      // Input and button should be disabled while sending
      expect(input).toBeDisabled()
      expect(sendButton).toBeDisabled()
    })
  })

  describe('Error Handling', () => {
    const mockSession = {
      data: {
        user: { name: 'Test User', email: 'test@example.com' },
        accessToken: 'mock-access-token',
        expires: '2024-01-01T00:00:00.000Z'
      },
      status: 'authenticated' as const,
      update: jest.fn()
    }

    it('displays network errors in user-friendly banner', async () => {
      mockUseSession.mockReturnValue(mockSession)
      
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      render(<ChatPage />)

      await waitFor(() => {
        expect(screen.getAllByText(/network error/i)[0]).toBeInTheDocument()
      })
    })

    it('shows detailed error information when debug panel is open', async () => {
      mockUseSession.mockReturnValue(mockSession)
      
      mockFetch.mockResolvedValueOnce(createMockResponse({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        headers: { 'content-type': 'application/json' },
        json: () => Promise.resolve({ error: 'Invalid token' })
      }))

      render(<ChatPage />)

      // Wait for error to appear
      await waitFor(() => {
        expect(screen.getByText(/invalid token/i)).toBeInTheDocument()
      })

      // Find and click debug toggle (might be in an error details section)
      const debugToggle = screen.getByText(/show technical details/i)
      fireEvent.click(debugToggle)

      // Should show detailed error information
      await waitFor(() => {
        expect(screen.getByText(/401 unauthorized/i)).toBeInTheDocument()
      })
    })
  })
}) 