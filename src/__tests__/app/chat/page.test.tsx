import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { useSession } from 'next-auth/react'
import ChatPage from '@/app/chat/page'

// Mock next-auth/react
jest.mock('next-auth/react')
const mockUseSession = useSession as jest.MockedFunction<typeof useSession>

// Mock Google Drive client
jest.mock('@/lib/google-drive/client', () => ({
  searchEmbeddingsFile: jest.fn(),
  downloadEmbeddingsFile: jest.fn(),
}))

// Mock OpenAI embeddings
jest.mock('@/lib/openai/embeddings', () => ({
  generateEmbedding: jest.fn(),
}))

// Mock similarity search
jest.mock('@/lib/embeddings/similarity-search', () => ({
  performSimilaritySearch: jest.fn(),
}))

describe('Chat Page', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers()
    mockUseSession.mockReturnValue({
      data: {
        user: {
          name: 'John Doe',
          email: 'john@example.com',
        },
        accessToken: 'mock-access-token',
        expires: '2024-01-01',
      },
      status: 'authenticated',
      update: jest.fn(),
    })
  })

  afterEach(() => {
    jest.runOnlyPendingTimers()
    jest.useRealTimers()
  })

  const renderAndWaitForLoad = async () => {
    render(<ChatPage />)
    
    // Fast-forward through the loading delay
    jest.advanceTimersByTime(2000)
    
    // Wait for the loading to complete
    await waitFor(() => {
      expect(screen.queryByText(/loading your documents/i)).not.toBeInTheDocument()
    })
  }

  describe('Page Structure', () => {
    it('should render the chat page with all required elements', async () => {
      await renderAndWaitForLoad()
      
      // Check for main heading
      expect(screen.getByRole('heading', { name: /chat/i })).toBeInTheDocument()
      
      // Check for input field
      const inputField = screen.getByRole('textbox', { name: /message/i })
      expect(inputField).toBeInTheDocument()
      expect(inputField).toHaveAttribute('placeholder', expect.stringContaining('Ask about your documents'))
      
      // Check for send button
      const sendButton = screen.getByRole('button', { name: /send/i })
      expect(sendButton).toBeInTheDocument()
      
      // Check for message display area
      expect(screen.getByTestId('message-display-area')).toBeInTheDocument()
    })

    it('should show loading state while embeddings are being loaded', () => {
      render(<ChatPage />)
      
      expect(screen.getByText(/loading your documents/i)).toBeInTheDocument()
    })
  })

  describe('Chat Functionality', () => {
    it('should handle message input and submission', async () => {
      await renderAndWaitForLoad()
      
      const inputField = screen.getByRole('textbox', { name: /message/i })
      const sendButton = screen.getByRole('button', { name: /send/i })
      
      // Type a message
      fireEvent.change(inputField, { target: { value: 'What are my project updates?' } })
      expect(inputField).toHaveValue('What are my project updates?')
      
      // Submit the message
      fireEvent.click(sendButton)
      
      // Input should be cleared after submission
      expect(inputField).toHaveValue('')
    })

    it('should display user messages in the chat', async () => {
      await renderAndWaitForLoad()
      
      const inputField = screen.getByRole('textbox', { name: /message/i })
      const sendButton = screen.getByRole('button', { name: /send/i })
      
      // Send a message
      fireEvent.change(inputField, { target: { value: 'Test message' } })
      fireEvent.click(sendButton)
      
      // Check if user message appears
      await waitFor(() => {
        expect(screen.getByText('Test message')).toBeInTheDocument()
      })
    })

    it('should show typing indicator during AI response', async () => {
      await renderAndWaitForLoad()
      
      const inputField = screen.getByRole('textbox', { name: /message/i })
      const sendButton = screen.getByRole('button', { name: /send/i })
      
      // Send a message
      fireEvent.change(inputField, { target: { value: 'Test question' } })
      fireEvent.click(sendButton)
      
      // Should show typing indicator
      await waitFor(() => {
        expect(screen.getByText(/marina is typing/i)).toBeInTheDocument()
      })
    })
  })

  describe('Citations and Links', () => {
    it('should display file citations with Drive links', async () => {
      await renderAndWaitForLoad()
      
      // Send a message to trigger response
      const inputField = screen.getByRole('textbox', { name: /message/i })
      const sendButton = screen.getByRole('button', { name: /send/i })
      
      fireEvent.change(inputField, { target: { value: 'Show project updates' } })
      fireEvent.click(sendButton)
      
      // Fast-forward to get the AI response
      jest.advanceTimersByTime(2000)
      
      // Check for citations
      await waitFor(() => {
        expect(screen.getByText('Project_Status.pdf')).toBeInTheDocument()
      }, { timeout: 1000 })
    })
  })

  describe('Authentication States', () => {
    it('should redirect unauthenticated users', () => {
      mockUseSession.mockReturnValue({
        data: null,
        status: 'unauthenticated',
        update: jest.fn(),
      })
      
      render(<ChatPage />)
      
      expect(screen.getByText(/please sign in/i)).toBeInTheDocument()
    })

    it('should show loading state for authentication', () => {
      mockUseSession.mockReturnValue({
        data: null,
        status: 'loading',
        update: jest.fn(),
      })
      
      render(<ChatPage />)
      
      expect(screen.getByText(/loading/i)).toBeInTheDocument()
    })
  })
}) 