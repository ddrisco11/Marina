import { describe, it, expect, jest, beforeEach } from '@jest/globals'

// Import types and functions AFTER mocking
import type { DriveFile } from '@/types/embeddings'
import { 
  searchEmbeddingsFile, 
  downloadEmbeddingsFile, 
  uploadEmbeddingsFile,
  scanAllFiles,
  downloadFileContent 
} from '@/lib/google-drive/client'

// Import the mock functions from the manual mock
import { mockDriveFiles } from '@/__mocks__/googleapis'

// Tell Jest to use the manual mock
jest.mock('googleapis')

describe('Google Drive Client', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('searchEmbeddingsFile', () => {
    it('should find existing marina-embeddings.json file', async () => {
      mockDriveFiles.list.mockResolvedValue({
        data: {
          files: [
            {
              id: 'embeddings-file-id',
              name: 'marina-embeddings.json',
              mimeType: 'application/json',
              modifiedTime: '2023-01-01T00:00:00Z',
            },
          ],
        },
      })
      
      const accessToken = 'test-access-token'
      const result = await searchEmbeddingsFile(accessToken)

      expect(result).toEqual({
        id: 'embeddings-file-id',
        name: 'marina-embeddings.json',
        mimeType: 'application/json',
        modifiedTime: '2023-01-01T00:00:00Z',
      })
      
      expect(mockDriveFiles.list).toHaveBeenCalledWith({
        q: "name='marina-embeddings.json' and trashed=false",
        fields: 'files(id,name,mimeType,modifiedTime)',
        spaces: 'drive',
      })
    })

    it('should return null when embeddings file not found', async () => {
      mockDriveFiles.list.mockResolvedValue({
        data: { files: [] },
      })

      const accessToken = 'test-access-token'
      const result = await searchEmbeddingsFile(accessToken)

      expect(result).toBeNull()
    })

    it('should handle Drive API errors', async () => {
      mockDriveFiles.list.mockRejectedValue(new Error('Drive API Error'))

      const accessToken = 'test-access-token'
      
      await expect(searchEmbeddingsFile(accessToken)).rejects.toThrow('Failed to search for embeddings file: Drive API Error')
    })
  })

  describe('downloadEmbeddingsFile', () => {
    it('should download and parse embeddings file', async () => {
      const mockEmbeddingsData = {
        version: '1.0',
        generatedAt: '2023-01-01T00:00:00Z',
        totalFiles: 2,
        embeddings: [
          {
            fileId: 'file1',
            fileName: 'doc1.txt',
            content: 'Content 1',
            vector: [0.1, 0.2, 0.3],
            mimeType: 'text/plain',
            metadata: {
              modifiedTime: '2023-01-01T00:00:00Z',
              extractedAt: '2023-01-01T00:00:00Z',
            },
          },
        ],
        metadata: {
          openaiModel: 'text-embedding-3-small',
          embeddingDimension: 1536,
        },
      }

      mockDriveFiles.get.mockResolvedValue({
        data: JSON.stringify(mockEmbeddingsData),
      })

      const accessToken = 'test-access-token'
      const fileId = 'embeddings-file-id'
      const result = await downloadEmbeddingsFile(accessToken, fileId)

      expect(result).toEqual(mockEmbeddingsData)
      expect(mockDriveFiles.get).toHaveBeenCalledWith({
        fileId,
        alt: 'media',
      })
    })

    it('should handle invalid JSON in embeddings file', async () => {
      mockDriveFiles.get.mockResolvedValue({
        data: 'invalid json content',
      })

      const accessToken = 'test-access-token'
      const fileId = 'embeddings-file-id'

      await expect(downloadEmbeddingsFile(accessToken, fileId)).rejects.toThrow('Invalid embeddings file format')
    })
  })

  describe('uploadEmbeddingsFile', () => {
    it('should upload new embeddings file', async () => {
      const mockEmbeddingsData = {
        version: '1.0',
        generatedAt: '2023-01-01T00:00:00Z',
        totalFiles: 1,
        embeddings: [],
        metadata: {
          openaiModel: 'text-embedding-3-small',
          embeddingDimension: 1536,
        },
      }

      mockDriveFiles.create.mockResolvedValue({
        data: {
          id: 'new-embeddings-file-id',
          name: 'marina-embeddings.json',
        },
      })

      const accessToken = 'test-access-token'
      const result = await uploadEmbeddingsFile(accessToken, mockEmbeddingsData)

      expect(result.id).toBe('new-embeddings-file-id')
      expect(mockDriveFiles.create).toHaveBeenCalledWith({
        requestBody: {
          name: 'marina-embeddings.json',
          mimeType: 'application/json',
        },
        media: {
          mimeType: 'application/json',
          body: JSON.stringify(mockEmbeddingsData, null, 2),
        },
      })
    })

    it('should update existing embeddings file', async () => {
      const mockEmbeddingsData = {
        version: '1.0',
        generatedAt: '2023-01-01T00:00:00Z',
        totalFiles: 1,
        embeddings: [],
        metadata: {
          openaiModel: 'text-embedding-3-small',
          embeddingDimension: 1536,
        },
      }

      mockDriveFiles.update.mockResolvedValue({
        data: {
          id: 'existing-embeddings-file-id',
          name: 'marina-embeddings.json',
        },
      })

      const accessToken = 'test-access-token'
      const existingFileId = 'existing-embeddings-file-id'
      const result = await uploadEmbeddingsFile(accessToken, mockEmbeddingsData, existingFileId)

      expect(result.id).toBe('existing-embeddings-file-id')
      expect(mockDriveFiles.update).toHaveBeenCalledWith({
        fileId: existingFileId,
        media: {
          mimeType: 'application/json',
          body: JSON.stringify(mockEmbeddingsData, null, 2),
        },
      })
    })
  })

  describe('scanAllFiles', () => {
    it('should scan and return all Drive files with supported types', async () => {
      const mockFiles = [
        {
          id: 'file1',
          name: 'document.txt',
          mimeType: 'text/plain',
          size: '1024',
          modifiedTime: '2023-01-01T00:00:00Z',
          webViewLink: 'https://drive.google.com/file/d/file1',
        },
        {
          id: 'file2',
          name: 'spreadsheet.xlsx',
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          size: '2048',
          modifiedTime: '2023-01-02T00:00:00Z',
          webViewLink: 'https://drive.google.com/file/d/file2',
        },
        {
          id: 'file3',
          name: 'image.jpg',
          mimeType: 'image/jpeg',
          size: '500000',
          modifiedTime: '2023-01-03T00:00:00Z',
          webViewLink: 'https://drive.google.com/file/d/file3',
        },
      ]

      mockDriveFiles.list.mockResolvedValue({
        data: { files: mockFiles },
      })

      const accessToken = 'test-access-token'
      const result = await scanAllFiles(accessToken)

      // Should filter out unsupported file types (image)
      expect(result).toHaveLength(2)
      expect(result[0]!.mimeType).toBe('text/plain')
      expect(result[1]!.mimeType).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    })

    it('should handle pagination for large Drive results', async () => {
      const firstPageFiles = Array.from({ length: 100 }, (_, i) => ({
        id: `file${i}`,
        name: `document${i}.txt`,
        mimeType: 'text/plain',
        size: '1024',
        modifiedTime: '2023-01-01T00:00:00Z',
        webViewLink: `https://drive.google.com/file/d/file${i}`,
      }))

      const secondPageFiles = Array.from({ length: 50 }, (_, i) => ({
        id: `file${i + 100}`,
        name: `document${i + 100}.txt`,
        mimeType: 'text/plain',
        size: '1024',
        modifiedTime: '2023-01-01T00:00:00Z',
        webViewLink: `https://drive.google.com/file/d/file${i + 100}`,
      }))

      mockDriveFiles.list
        .mockResolvedValueOnce({
          data: {
            files: firstPageFiles,
            nextPageToken: 'next-page-token',
          },
        })
        .mockResolvedValueOnce({
          data: {
            files: secondPageFiles,
          },
        })

      const accessToken = 'test-access-token'
      const result = await scanAllFiles(accessToken)

      expect(result).toHaveLength(150)
      expect(mockDriveFiles.list).toHaveBeenCalledTimes(2)
    })
  })

  describe('downloadFileContent', () => {
    it('should download content for text files', async () => {
      const mockContent = 'This is the file content'
      mockDriveFiles.get.mockResolvedValue({
        data: mockContent,
      })

      const accessToken = 'test-access-token'
      const file: DriveFile = {
        id: 'file1',
        name: 'document.txt',
        mimeType: 'text/plain',
        modifiedTime: '2023-01-01T00:00:00Z',
      }

      const result = await downloadFileContent(accessToken, file)
      
      expect(result).toBe(mockContent)
      expect(mockDriveFiles.get).toHaveBeenCalledWith({
        fileId: 'file1',
        alt: 'media',
      })
    })

    it('should export Google Docs as plain text', async () => {
      const mockContent = 'Google Doc content as text'
      mockDriveFiles.get.mockResolvedValue({
        data: mockContent,
      })

      const accessToken = 'test-access-token'
      const file: DriveFile = {
        id: 'file1',
        name: 'document',
        mimeType: 'application/vnd.google-apps.document',
        modifiedTime: '2023-01-01T00:00:00Z',
      }

      const result = await downloadFileContent(accessToken, file)
      
      expect(result).toBe(mockContent)
      expect(mockDriveFiles.get).toHaveBeenCalledWith({
        fileId: 'file1',
        mimeType: 'text/plain',
      })
    })

    it('should handle download errors gracefully', async () => {
      mockDriveFiles.get.mockRejectedValue(new Error('Download failed'))

      const accessToken = 'test-access-token'
      const file: DriveFile = {
        id: 'file1',
        name: 'document.txt',
        mimeType: 'text/plain',
        modifiedTime: '2023-01-01T00:00:00Z',
      }

      const result = await downloadFileContent(accessToken, file)
      
      // Should return empty string on error instead of throwing
      expect(result).toBe('')
    })
  })
}) 