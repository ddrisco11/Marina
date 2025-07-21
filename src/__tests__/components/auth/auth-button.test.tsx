import { render, screen, fireEvent } from '@testing-library/react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import AuthButton from '@/components/auth/auth-button'

// Mock next-auth/react
jest.mock('next-auth/react')
const mockUseSession = useSession as jest.MockedFunction<typeof useSession>

// Mock next/navigation
const mockPush = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    back: jest.fn(),
    forward: jest.fn(),
    refresh: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn(),
  }),
}))

describe('AuthButton Component', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('when user is not authenticated', () => {
    it('should show sign in button', () => {
      mockUseSession.mockReturnValue({
        data: null,
        status: 'unauthenticated',
        update: jest.fn(),
      })

      render(<AuthButton />)
      
      const signInButton = screen.getByRole('button', { name: /sign in with google/i })
      expect(signInButton).toBeInTheDocument()
    })
  })

  describe('when user is authenticated', () => {
    beforeEach(() => {
      mockUseSession.mockReturnValue({
        data: {
          user: {
            name: 'John Doe',
            email: 'john@example.com',
            image: 'https://example.com/avatar.jpg',
          },
          expires: '2024-01-01',
        },
        status: 'authenticated',
        update: jest.fn(),
      })
    })

    it('should show user profile and buttons', () => {
      render(<AuthButton />)
      
      expect(screen.getByText('John Doe')).toBeInTheDocument()
      expect(screen.getByText('john@example.com')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /go to chat/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument()
    })

    it('should navigate to /chat when "Go to Chat" button is clicked', () => {
      render(<AuthButton />)
      
      const chatButton = screen.getByRole('button', { name: /go to chat/i })
      fireEvent.click(chatButton)
      
      expect(mockPush).toHaveBeenCalledWith('/chat')
    })
  })

  describe('when loading', () => {
    it('should show loading state', () => {
      mockUseSession.mockReturnValue({
        data: null,
        status: 'loading',
        update: jest.fn(),
      })

      render(<AuthButton />)
      
      const loadingButton = screen.getByRole('button', { name: /loading/i })
      expect(loadingButton).toBeInTheDocument()
      expect(loadingButton).toBeDisabled()
    })
  })
}) 