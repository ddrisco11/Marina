import React from 'react'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { useSession } from 'next-auth/react'
import ChatPage from '@/app/chat/page'

// Mock next-auth
jest.mock('next-auth/react')
const mockUseSession = useSession as jest.MockedFunction<typeof useSession>

// Mock fetch globally
const mockFetch = jest.fn()
global.fetch = mockFetch

// Mock TextDecoder
global.TextDecoder = class MockTextDecoder {
  encoding = 'utf-8'
  fatal = false
  ignoreBOM = false
  
  decode(input: any) {
    return new Uint8Array(input).reduce((data: string, byte: number) => data + String.fromCharCode(byte), '')
  }
} as any

// Mock ReadableStream
class MockReadableStream {
  private _chunks: string[] = []
  
  constructor(source: any) {
    // Store source if needed
  }
  
  getReader() {
    const chunks = this._chunks || []
    let index = 0
    
    return {
      read: async () => {
        if (index < chunks.length) {
          const value = new TextEncoder().encode(chunks[index++])
          return { done: false, value }
        }
        return { done: true, value: undefined }
      }
    }
  }
}

global.ReadableStream = MockReadableStream as any

describe('ChatPage - Embeddings Error Handling', () => {
  beforeEach(() => {
    mockFetch.mockClear()
    
    // Mock successful session with access token
    mockUseSession.mockReturnValue({
      data: {
        accessToken: 'mock-access-token-123',
        user: { email: 'test@example.com' }
      },
      status: 'authenticated'
    } as any)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('Success Flow', () => {
    it('should not show error banner when embeddings load successfully', async () => {
      // Mock successful GET response with existing embeddings
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Map([['content-type', 'application/json']]),
        text: () => Promise.resolve(JSON.stringify({
          embeddings: [
            { fileId: '1', fileName: 'test.pdf', vector: [0.1, 0.2] }
          ]
        }))
      })

      render(<ChatPage />)

      // Wait for embeddings to load
      await waitFor(() => {
        expect(screen.getByText('1 documents indexed')).toBeInTheDocument()
      })

      // Assert no error banner appears
      expect(screen.queryByText('Error')).not.toBeInTheDocument()
      expect(screen.queryByText('Unknown error occurred')).not.toBeInTheDocument()
      
      // Assert chat interface is shown
      expect(screen.getByPlaceholderText('Ask about your documents...')).toBeInTheDocument()
      expect(screen.getByText('Start a conversation about your documents!')).toBeInTheDocument()
    })

    it('should stream messages without error when chat works', async () => {
      // Mock successful embeddings load
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Map([['content-type', 'application/json']]),
        text: () => Promise.resolve(JSON.stringify({
          embeddings: [{ fileId: '1', fileName: 'test.pdf', vector: [0.1, 0.2] }]
        }))
      })

      render(<ChatPage />)

      await waitFor(() => {
        expect(screen.getByText('1 documents indexed')).toBeInTheDocument()
      })

      // Mock successful chat response
      const mockStream = new MockReadableStream({}) as any
      mockStream._chunks = ['Hello ', 'world!']
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Map([['content-type', 'text/event-stream']]),
        body: mockStream
      })

      // Send a message
      const input = screen.getByPlaceholderText('Ask about your documents...')
      const sendButton = screen.getByText('Send')
      
      fireEvent.change(input, { target: { value: 'Test question' } })
      fireEvent.click(sendButton)

      // Should show typing indicator, no error
      await waitFor(() => {
        expect(screen.getByText('Marina is thinking...')).toBeInTheDocument()
      })
      
      expect(screen.queryByText('Error')).not.toBeInTheDocument()
    })
  })

  describe('In-Progress Streaming', () => {
    it('should show loading state during embeddings creation without error', async () => {
      // Mock 404 for GET (no existing embeddings)
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: new Map([['content-type', 'application/json']]),
        text: () => Promise.resolve(JSON.stringify({ error: 'Not found' }))
      })

      // Mock successful streaming POST response
      const mockStream = new MockReadableStream({}) as any
      mockStream._chunks = [
        'event: start\ndata: {"total": 2, "toEmbed": 2}\n\n',
        'event: progress\ndata: {"current": 1, "total": 2, "fileName": "doc1.pdf", "status": "completed"}\n\n',
        'event: progress\ndata: {"current": 2, "total": 2, "fileName": "doc2.pdf", "status": "completed"}\n\n',
        'event: complete\ndata: {"success": true, "total": 2}\n\n'
      ]

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Map([['content-type', 'text/event-stream']]),
        body: mockStream
      })

      // Mock final GET request after completion
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Map([['content-type', 'application/json']]),
        text: () => Promise.resolve(JSON.stringify({
          embeddings: [
            { fileId: '1', fileName: 'doc1.pdf', vector: [0.1, 0.2] },
            { fileId: '2', fileName: 'doc2.pdf', vector: [0.3, 0.4] }
          ]
        }))
      })

      render(<ChatPage />)

      // Should eventually complete successfully without error
      await waitFor(() => {
        expect(screen.getByText('2 documents indexed')).toBeInTheDocument()
      }, { timeout: 3000 })

      // Should NOT show error banner for the process
      expect(screen.queryByText('Error')).not.toBeInTheDocument()
      expect(screen.queryByText('Unknown error occurred')).not.toBeInTheDocument()
    })
  })

  describe('API Error Handling', () => {
    it('should show error banner only for genuine API failures', async () => {
      // Mock network failure for GET request
      mockFetch.mockRejectedValueOnce(new Error('Network error: Failed to fetch'))

      render(<ChatPage />)

      // Should show error banner for genuine API failure
      await waitFor(() => {
        expect(screen.getByText('Error')).toBeInTheDocument()
        expect(screen.getByText('Network error: Failed to fetch')).toBeInTheDocument()
      })

      // Should show technical details toggle
      const detailsButton = screen.getByText('Show technical details')
      expect(detailsButton).toBeInTheDocument()
      
      fireEvent.click(detailsButton)
      
      // Should show timestamp and stack trace
      await waitFor(() => {
        expect(screen.getByText(/Timestamp:/)).toBeInTheDocument()
        expect(screen.getByText(/Stack Trace:/)).toBeInTheDocument()
      })
    })

    it('should show error banner for server 500 error', async () => {
      // Mock 500 server error
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        headers: new Map([['content-type', 'application/json']]),
        text: () => Promise.resolve(JSON.stringify({
          error: 'Database connection failed'
        }))
      })

      render(<ChatPage />)

      // Should show error banner with server error
      await waitFor(() => {
        expect(screen.getByText('Error')).toBeInTheDocument()
        expect(screen.getByText('Database connection failed')).toBeInTheDocument()
      })

      // Technical details should show HTTP status
      const detailsButton = screen.getByText('Show technical details')
      fireEvent.click(detailsButton)
      
      await waitFor(() => {
        expect(screen.getByText(/HTTP Status:/)).toBeInTheDocument()
        expect(screen.getByText(/500/)).toBeInTheDocument()
      })
    })

    it('should NOT show error banner for individual file failures during streaming', async () => {
      // Mock 404 for GET (no existing embeddings)
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: new Map([['content-type', 'application/json']]),
        text: () => Promise.resolve(JSON.stringify({ error: 'Not found' }))
      })

      // Mock streaming with individual file error - should NOT cause UI error
      const mockStream = new MockReadableStream({}) as any
      mockStream._chunks = [
        'event: start\ndata: {"total": 2, "toEmbed": 2}\n\n',
        'event: progress\ndata: {"current": 1, "total": 2, "fileName": "doc1.pdf", "status": "completed"}\n\n',
        'event: error\ndata: {"fileName": "doc2.pdf", "error": "Unknown error occurred"}\n\n',
        'event: complete\ndata: {"success": true, "total": 1}\n\n'
      ]

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Map([['content-type', 'text/event-stream']]),
        body: mockStream
      })

      // Mock final GET request 
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Map([['content-type', 'application/json']]),
        text: () => Promise.resolve(JSON.stringify({
          embeddings: [{ fileId: '1', fileName: 'doc1.pdf', vector: [0.1, 0.2] }]
        }))
      })

      render(<ChatPage />)

      // Even with individual file error, should NOT show error banner
      // and should complete successfully
      await waitFor(() => {
        expect(screen.getByText('1 documents indexed')).toBeInTheDocument()
      }, { timeout: 3000 })

      // Should NOT show error banner for individual file failures
      expect(screen.queryByText('Error')).not.toBeInTheDocument()
      expect(screen.queryByText('Unknown error occurred')).not.toBeInTheDocument()
    })
  })
}) 