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
  body: null
})

describe('ChatAuthFlowFix', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockFetch.mockClear()
  })

  describe('RED → GREEN TDD Cycle', () => {
    it('RED: shows ONLY loading spinner when status=loading (no error banner)', () => {
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
      expect(screen.queryByText(/you need to sign in to access the chat feature/i)).not.toBeInTheDocument()
      
      // Should NOT show chat interface
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    })

    it('RED: shows ONLY error banner when status=unauthenticated (no chat UI)', () => {
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

    it('GREEN: hides error banner, calls loadEmbeddings once, shows chat UI when fully authenticated', async () => {
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
      }, { timeout: 3000 })

      // CRITICAL: After authentication and loading, error banner should NOT be visible
      expect(screen.queryByText(/please sign in to use this feature/i)).not.toBeInTheDocument()
      expect(screen.queryByText(/you need to sign in to access the chat feature/i)).not.toBeInTheDocument()
      
      // Should NOT show loading spinner after embeddings are loaded
      expect(screen.queryByText(/loading/i)).not.toBeInTheDocument()

      // Should show the main chat interface
      expect(screen.getByText(/marina chat/i)).toBeInTheDocument()
      expect(screen.getByRole('textbox', { name: /ask about your documents/i })).toBeInTheDocument()

      // Verify loadEmbeddings was called exactly once
      expect(mockFetch).toHaveBeenCalledTimes(1)
      expect(mockFetch).toHaveBeenCalledWith('/api/embeddings', {
        method: 'GET',
        headers: {
          Authorization: 'Bearer valid-access-token',
          'Cache-Control': 'no-store',
          Pragma: 'no-cache'
        }
      })
    })

    it('GREEN: transitions correctly from loading → authenticated without showing error banner', async () => {
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
      }, { timeout: 3000 })

      // Should never show error banner during this transition
      expect(screen.queryByText(/please sign in/i)).not.toBeInTheDocument()
      expect(screen.queryByText(/you need to sign in/i)).not.toBeInTheDocument()
      
      // Should show final chat interface
      expect(screen.getByText(/1 documents indexed/i)).toBeInTheDocument()
    })

    it('GREEN: shows specific auth error when authenticated but missing accessToken', () => {
      mockUseSession.mockReturnValue({
        data: { 
          user: { name: 'Test User' },
          expires: '2024-01-01T00:00:00.000Z'
          // No accessToken
        },
        status: 'authenticated',
        update: jest.fn()
      })

      render(<ChatPage />)
      
      // Should show specific error for missing access token
      expect(screen.getByText(/please sign in to use this feature/i)).toBeInTheDocument()
      
      // Should NOT show loading spinner
      expect(screen.queryByText(/loading/i)).not.toBeInTheDocument()
      
      // Should NOT show chat interface
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
      
      // Should NOT call loadEmbeddings
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })
}) 