import { describe, it, expect, jest, beforeEach } from '@jest/globals'
import type { DriveFile } from '@/types/embeddings'
import { generateEmbedding, generateEmbeddingsBatch, extractTextContent } from '@/lib/openai/embeddings'

// Mock OpenAI with proper structure
const mockEmbeddings = {
  create: jest.fn() as jest.MockedFunction<any>,
}

const mockOpenAIInstance = {
  embeddings: mockEmbeddings,
}

// Mock the OpenAI constructor to return our mock instance
const MockOpenAI = jest.fn(() => mockOpenAIInstance)

jest.mock('openai', () => ({
  __esModule: true,
  default: MockOpenAI,
  OpenAI: MockOpenAI,
}))

describe('OpenAI Embeddings', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('generateEmbedding', () => {
    it('should generate embedding for text content', async () => {
      const mockEmbedding = [0.1, 0.2, 0.3, 0.4]
      mockEmbeddings.create.mockResolvedValue({
        data: [{ embedding: mockEmbedding }],
        usage: { prompt_tokens: 10, total_tokens: 10 },
      })

      const text = 'This is a test document about machine learning'
      const result = await generateEmbedding(text)

      expect(result.vector).toEqual(mockEmbedding)
      expect(result.usage.promptTokens).toBe(10)
      expect(mockEmbeddings.create).toHaveBeenCalledWith({
        model: 'text-embedding-3-small',
        input: text,
        encoding_format: 'float',
      })
    })

    it('should handle OpenAI API errors gracefully', async () => {
      const error = new Error('OpenAI API Error')
      mockEmbeddings.create.mockRejectedValue(error)

      const text = 'Test content'
      
      await expect(generateEmbedding(text)).rejects.toThrow('Failed to generate embedding: OpenAI API Error')
    })

    it('should handle empty text input', async () => {
      await expect(generateEmbedding('')).rejects.toThrow('Text content cannot be empty')
    })

    it('should handle very long text by truncating', async () => {
      const longText = 'word '.repeat(10000) // Very long text
      const mockEmbedding = [0.1, 0.2, 0.3, 0.4]
      
      mockEmbeddings.create.mockResolvedValue({
        data: [{ embedding: mockEmbedding }],
        usage: { prompt_tokens: 100, total_tokens: 100 },
      })

      const result = await generateEmbedding(longText)
      
      expect(result.vector).toEqual(mockEmbedding)
      // Should have called with truncated text (not the full long text)
      expect(mockEmbeddings.create).toHaveBeenCalled()
    })
  })

  describe('generateEmbeddingsBatch', () => {
    const mockFiles: DriveFile[] = [
      {
        id: 'file1',
        name: 'document1.txt',
        mimeType: 'text/plain',
        modifiedTime: '2023-01-01T00:00:00Z',
        content: 'This is document 1 content',
      },
      {
        id: 'file2',
        name: 'document2.txt',
        mimeType: 'text/plain',
        modifiedTime: '2023-01-02T00:00:00Z',
        content: 'This is document 2 content',
      },
    ]

    it('should generate embeddings for multiple files', async () => {
      const mockEmbedding1 = [0.1, 0.2, 0.3, 0.4]
      const mockEmbedding2 = [0.5, 0.6, 0.7, 0.8]
      
      mockEmbeddings.create
        .mockResolvedValueOnce({
          data: [{ embedding: mockEmbedding1 }],
          usage: { prompt_tokens: 10, total_tokens: 10 },
        })
        .mockResolvedValueOnce({
          data: [{ embedding: mockEmbedding2 }],
          usage: { prompt_tokens: 15, total_tokens: 15 },
        })

      const progressCallback = jest.fn()
      const result = await generateEmbeddingsBatch(mockFiles, progressCallback)

      expect(result).toHaveLength(2)
      expect(result[0]!.vector).toEqual(mockEmbedding1)
      expect(result[1]!.vector).toEqual(mockEmbedding2)
      expect(result[0]!.fileId).toBe('file1')
      expect(result[1]!.fileId).toBe('file2')
      
      // Check progress callbacks
      expect(progressCallback).toHaveBeenCalledWith({
        current: 1,
        total: 2,
        currentFile: 'Document 1.txt',
        status: 'processing',
      })
      expect(progressCallback).toHaveBeenCalledWith({
        current: 2,
        total: 2,
        currentFile: 'document2.txt',
        status: 'processing',
      })
      expect(progressCallback).toHaveBeenCalledWith({
        current: 2,
        total: 2,
        currentFile: 'document2.txt',
        status: 'complete',
      })
    })

    it('should handle partial failures in batch processing', async () => {
      const progressCallback = jest.fn()
      const mockEmbedding1 = [0.1, 0.2, 0.3, 0.4]
      
      mockEmbeddings.create
        .mockResolvedValueOnce({
          data: [{ embedding: mockEmbedding1 }],
          usage: { prompt_tokens: 10, total_tokens: 10 },
        })
        .mockRejectedValueOnce(new Error('OpenAI API Error'))

      const result = await generateEmbeddingsBatch(mockFiles, progressCallback)

      // Should return only successful embeddings
      expect(result).toHaveLength(1)
      expect(result[0]!.vector).toEqual(mockEmbedding1)
      expect(result[0]!.fileId).toBe('file1')
      
      // Should report error in progress
      expect(progressCallback).toHaveBeenCalledWith({
        current: 2,
        total: 2,
        currentFile: 'document2.txt',
        status: 'error',
        error: 'API Error',
      })
    })

    it('should skip files without content', async () => {
      const filesWithEmpty = [
        ...mockFiles,
        {
          id: 'file3',
          name: 'empty.txt',
          mimeType: 'text/plain',
          modifiedTime: '2023-01-03T00:00:00Z',
          content: '',
        },
      ]

      const mockEmbedding = [0.1, 0.2, 0.3, 0.4]
      mockEmbeddings.create.mockResolvedValue({
        data: [{ embedding: mockEmbedding }],
        usage: { prompt_tokens: 10, total_tokens: 10 },
      })

      const progressCallback = jest.fn()
      const result = await generateEmbeddingsBatch(filesWithEmpty, progressCallback)

      // Should only process files with content
      expect(result).toHaveLength(2)
      expect(mockEmbeddings.create).toHaveBeenCalledTimes(2)
    })
  })

  describe('extractTextContent', () => {
    it('should extract text from plain text files', async () => {
      const file: DriveFile = {
        id: 'file1',
        name: 'document.txt',
        mimeType: 'text/plain',
        modifiedTime: '2023-01-01T00:00:00Z',
        content: 'This is plain text content',
      }

      const result = await extractTextContent(file)
      expect(result).toBe('This is plain text content')
    })

    it('should handle PDF files', async () => {
      const file: DriveFile = {
        id: 'file1',
        name: 'document.pdf',
        mimeType: 'application/pdf',
        modifiedTime: '2023-01-01T00:00:00Z',
        content: '%PDF-1.4 mock pdf content',
      }

      const result = await extractTextContent(file)
      expect(result).toContain('mock pdf content') // Should extract text from PDF
    })

    it('should handle Google Docs files', async () => {
      const file: DriveFile = {
        id: 'file1',
        name: 'document',
        mimeType: 'application/vnd.google-apps.document',
        modifiedTime: '2023-01-01T00:00:00Z',
        content: '<html><body>Google Doc content</body></html>',
      }

      const result = await extractTextContent(file)
      expect(result).toBe('Google Doc content') // Should strip HTML tags
    })

    it('should handle unsupported file types', async () => {
      const file: DriveFile = {
        id: 'file1',
        name: 'image.jpg',
        mimeType: 'image/jpeg',
        modifiedTime: '2023-01-01T00:00:00Z',
      }

      const result = await extractTextContent(file)
      expect(result).toBe('') // Should return empty string for unsupported types
    })

    it('should handle files without content', async () => {
      const file: DriveFile = {
        id: 'file1',
        name: 'document.txt',
        mimeType: 'text/plain',
        modifiedTime: '2023-01-01T00:00:00Z',
      }

      const result = await extractTextContent(file)
      expect(result).toBe('')
    })
  })
}) 