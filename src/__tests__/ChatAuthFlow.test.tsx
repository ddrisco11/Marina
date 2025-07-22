import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { useSession } from 'next-auth/react'
import ChatPage from '../app/chat/page'

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
      return init.json().then(data => JSON.stringify(data))
    }
    return Promise.resolve('{}')
  }),
  clone: () => createMockResponse(init),
  body: init.body || null
})

describe('ChatAuthFlow', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockFetch.mockClear()
  })

  describe('Authentication Flow States', () => {
    it('shows loading spinner when session status is loading', () => {
      mockUseSession.mockReturnValue({
        data: null,
        status: 'loading',
        update: jest.fn()
      })

      render(<ChatPage />)
      
      // Should show loading spinner
      expect(screen.getByText(/loading/i)).toBeInTheDocument()
      
      // Should NOT show error banner
      expect(screen.queryByText(/please sign in to use this feature/i)).not.toBeInTheDocument()
      
      // Should NOT show chat interface
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    })

    it('shows error banner when session status is unauthenticated', () => {
      mockUseSession.mockReturnValue({
        data: null,
        status: 'unauthenticated',
        update: jest.fn()
      })

      render(<ChatPage />)
      
      // Should show error banner
      expect(screen.getByText(/you need to sign in to access the chat feature/i)).toBeInTheDocument()
      
      // Should NOT show loading spinner
      expect(screen.queryByText(/loading/i)).not.toBeInTheDocument()
      
      // Should NOT show chat interface
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
      
      // Should show error banner for missing access token
      expect(screen.getByText(/please sign in to use this feature/i)).toBeInTheDocument()
      
      // Should NOT show loading spinner
      expect(screen.queryByText(/loading/i)).not.toBeInTheDocument()
      
      // Should NOT show chat interface
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    })

    it('CRITICAL: hides error banner and shows chat interface when fully authenticated', async () => {
      // Mock successful embeddings response
      const mockEmbeddings = [
        { id: '1', content: 'Test content', metadata: { fileName: 'test.txt' } }
      ]
      
      mockFetch.mockResolvedValueOnce(createMockResponse({
        ok: true,
        json: () => Promise.resolve({ embeddings: mockEmbeddings })
      }))

      mockUseSession.mockReturnValue({
        data: {
          user: { name: 'Test User', email: 'test@example.com' },
          accessToken: 'valid-access-token',
          expires: '2024-01-01T00:00:00.000Z'
        },
        status: 'authenticated',
        update: jest.fn()
      })

      render(<ChatPage />)

      // Wait for embeddings to load completely
      await waitFor(() => {
        expect(screen.getByText(/1 documents indexed/i)).toBeInTheDocument()
        expect(screen.getByRole('textbox', { name: /ask about your documents/i })).toBeInTheDocument()
      })

      // CRITICAL: After loading is complete, error banner should NOT be visible
      expect(screen.queryByText(/please sign in to use this feature/i)).not.toBeInTheDocument()
      expect(screen.queryByText(/you need to sign in to access the chat feature/i)).not.toBeInTheDocument()
      
      // Should NOT show loading spinner after embeddings are loaded
      expect(screen.queryByText(/loading/i)).not.toBeInTheDocument()

      // Should show the main chat interface
      expect(screen.getByText(/marina chat/i)).toBeInTheDocument()

      // Verify embeddings API was called
      expect(mockFetch).toHaveBeenCalledWith('/api/embeddings', {
        method: 'GET',
        headers: {
          Authorization: 'Bearer valid-access-token',
          'Cache-Control': 'no-store',
          Pragma: 'no-cache'
        }
      })
    })

    it('CRITICAL: should never show error banner during embeddings loading when authenticated', async () => {
      // Mock delayed embeddings response to test loading state
      const mockEmbeddings = [
        { id: '1', content: 'Test content', metadata: { fileName: 'test.txt' } }
      ]
      
      let resolveEmbeddings!: (value: any) => void
      const embeddingsPromise = new Promise(resolve => {
        resolveEmbeddings = resolve
      })
      
      mockFetch.mockReturnValueOnce(embeddingsPromise)

      mockUseSession.mockReturnValue({
        data: {
          user: { name: 'Test User', email: 'test@example.com' },
          accessToken: 'valid-access-token',
          expires: '2024-01-01T00:00:00.000Z'
        },
        status: 'authenticated',
        update: jest.fn()
      })

      render(<ChatPage />)

      // During loading, should show loading indicator but NOT error banner
      expect(screen.getByText(/loading embeddings/i)).toBeInTheDocument()
      expect(screen.queryByText(/please sign in to use this feature/i)).not.toBeInTheDocument()
      expect(screen.queryByText(/you need to sign in to access the chat feature/i)).not.toBeInTheDocument()

      // Complete the embeddings loading
      resolveEmbeddings(createMockResponse({
        ok: true,
        json: () => Promise.resolve({ embeddings: mockEmbeddings })
      }))

      // After loading completes, should show chat interface and still no error banner
      await waitFor(() => {
        expect(screen.getByText(/1 documents indexed/i)).toBeInTheDocument()
      })

      expect(screen.queryByText(/please sign in to use this feature/i)).not.toBeInTheDocument()
      expect(screen.queryByText(/you need to sign in to access the chat feature/i)).not.toBeInTheDocument()
      expect(screen.getByRole('textbox', { name: /ask about your documents/i })).toBeInTheDocument()
    })

    it('handles embeddings loading error gracefully without showing auth error', async () => {
      // Mock failed embeddings response (but auth is valid)
      mockFetch.mockResolvedValueOnce(createMockResponse({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: () => Promise.resolve({ error: 'Server error loading embeddings' })
      }))

      mockUseSession.mockReturnValue({
        data: {
          user: { name: 'Test User', email: 'test@example.com' },
          accessToken: 'valid-access-token',
          expires: '2024-01-01T00:00:00.000Z'
        },
        status: 'authenticated',
        update: jest.fn()
      })

      render(<ChatPage />)

      // Should NOT show auth error banner even when embeddings fail
      expect(screen.queryByText(/please sign in to use this feature/i)).not.toBeInTheDocument()
      expect(screen.queryByText(/you need to sign in to access the chat feature/i)).not.toBeInTheDocument()

      // Should show the appropriate embeddings error instead
      await waitFor(() => {
        expect(screen.getAllByText(/server error loading embeddings/i)[0]).toBeInTheDocument()
      })
    })
  })

  describe('State Transitions', () => {
    it('transitions from loading to authenticated correctly', async () => {
      const mockEmbeddings = [
        { id: '1', content: 'Test content', metadata: { fileName: 'test.txt' } }
      ]
      
      mockFetch.mockResolvedValueOnce(createMockResponse({
        ok: true,
        json: () => Promise.resolve({ embeddings: mockEmbeddings })
      }))

      // Start with loading state
      mockUseSession.mockReturnValue({
        data: null,
        status: 'loading',
        update: jest.fn()
      })

      const { rerender } = render(<ChatPage />)
      
      // Should show loading
      expect(screen.getByText(/loading/i)).toBeInTheDocument()
      expect(screen.queryByText(/please sign in/i)).not.toBeInTheDocument()

      // Transition to authenticated
      mockUseSession.mockReturnValue({
        data: {
          user: { name: 'Test User', email: 'test@example.com' },
          accessToken: 'valid-access-token',
          expires: '2024-01-01T00:00:00.000Z'
        },
        status: 'authenticated',
        update: jest.fn()
      })

      rerender(<ChatPage />)

      // Wait for embeddings to load and chat interface to appear
      await waitFor(() => {
        expect(screen.getByRole('textbox')).toBeInTheDocument()
      })

      // Should hide loading and show chat interface after embeddings load
      expect(screen.queryByText(/loading/i)).not.toBeInTheDocument()
      expect(screen.queryByText(/please sign in/i)).not.toBeInTheDocument()
    })
  })
}) 