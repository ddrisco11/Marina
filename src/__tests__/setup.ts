import '@testing-library/jest-dom'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeAll, afterAll } from '@jest/globals'

// Mock scrollIntoView for JSDOM
global.Element.prototype.scrollIntoView = jest.fn()

// Mock ReadableStream for Node.js environment
global.ReadableStream = class MockReadableStream {
  private _source: any
  
  constructor(underlyingSource: any) {
    this._source = underlyingSource
  }
  
  getReader() {
    const source = this._source
    
    return {
      read: async () => {
        if (source && source.start) {
          return new Promise((resolve) => {
            const controller = {
              enqueue: (chunk: any) => resolve({ value: chunk, done: false }),
              close: () => resolve({ value: undefined, done: true })
            }
            source.start(controller)
          })
        }
        return { value: undefined, done: true }
      }
    }
  }
} as any

// Mock TextEncoder/TextDecoder if not available
global.TextEncoder = global.TextEncoder || class TextEncoder {
  encode(string: string) {
    return new Uint8Array(Buffer.from(string))
  }
}

global.TextDecoder = global.TextDecoder || class TextDecoder {
  decode(buffer: Uint8Array) {
    return Buffer.from(buffer).toString()
  }
}

// Clean up after each test
afterEach(() => {
  cleanup()
})

// Mock environment variables
beforeAll(() => {
  process.env = {
    ...process.env,
    NODE_ENV: 'test',
    NEXTAUTH_URL: 'http://localhost:3000',
    NEXTAUTH_SECRET: 'test-secret',
    GOOGLE_CLIENT_ID: 'test-google-client-id',
    GOOGLE_CLIENT_SECRET: 'test-google-client-secret',
    GOOGLE_DRIVE_API_KEY: 'test-drive-api-key',
    OPENAI_API_KEY: 'test-openai-api-key',
  }
})

// Mock Next.js router
jest.mock('next/router', () => ({
  useRouter() {
    return {
      route: '/',
      pathname: '/',
      query: {},
      asPath: '/',
      push: jest.fn(),
      pop: jest.fn(),
      reload: jest.fn(),
      back: jest.fn(),
      prefetch: jest.fn(),
      beforePopState: jest.fn(),
      events: {
        on: jest.fn(),
        off: jest.fn(),
        emit: jest.fn(),
      },
    }
  },
}))

// Mock Next.js navigation (App Router)
jest.mock('next/navigation', () => ({
  useRouter() {
    return {
      push: jest.fn(),
      replace: jest.fn(),
      refresh: jest.fn(),
      back: jest.fn(),
      forward: jest.fn(),
    }
  },
  useSearchParams() {
    return new URLSearchParams()
  },
  usePathname() {
    return '/'
  },
}))

// Mock NextAuth
jest.mock('next-auth/react', () => ({
  useSession: jest.fn(() => ({
    data: null,
    status: 'unauthenticated',
  })),
  signIn: jest.fn(),
  signOut: jest.fn(),
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
}))

// Mock Google APIs
jest.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: jest.fn(() => ({
        setCredentials: jest.fn(),
        getAccessToken: jest.fn(),
      })),
    },
    drive: jest.fn(() => ({
      files: {
        list: jest.fn(),
        get: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    })),
  },
}))

// Mock OpenAI
jest.mock('openai', () => {
  const mockOpenAI = jest.fn(() => ({
    embeddings: {
      create: jest.fn(),
    },
    chat: {
      completions: {
        create: jest.fn(),
      },
    },
  }))
  
  return {
    __esModule: true,
    default: mockOpenAI,
    OpenAI: mockOpenAI,
  }
})

// Global test timeout
jest.setTimeout(10000)

// Suppress console errors during tests (can be enabled for debugging)
global.console = {
  ...console,
  error: jest.fn(),
  warn: jest.fn(),
} 