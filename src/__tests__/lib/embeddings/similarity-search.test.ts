import { describe, it, expect, beforeEach } from '@jest/globals'
import type { Embedding, VectorSearchQuery, VectorSearchResult } from '@/types/embeddings'

// Import the function we'll implement
import { performSimilaritySearch, cosineSimilarity, normalizeVector } from '@/lib/embeddings/similarity-search'

describe('Similarity Search', () => {
  const mockEmbeddings: Embedding[] = [
    {
      fileId: 'file1',
      fileName: 'document1.txt',
      content: 'This is about machine learning and AI',
      vector: [0.1, 0.2, 0.3, 0.4],
      mimeType: 'text/plain',
      webViewLink: 'https://drive.google.com/file/d/file1',
      metadata: {
        modifiedTime: '2023-01-01T00:00:00Z',
        extractedAt: '2023-01-01T00:00:00Z',
      },
    },
    {
      fileId: 'file2',
      fileName: 'document2.txt',
      content: 'Information about cooking recipes',
      vector: [0.8, 0.1, 0.1, 0.0],
      mimeType: 'text/plain',
      webViewLink: 'https://drive.google.com/file/d/file2',
      metadata: {
        modifiedTime: '2023-01-02T00:00:00Z',
        extractedAt: '2023-01-02T00:00:00Z',
      },
    },
    {
      fileId: 'file3',
      fileName: 'document3.txt',
      content: 'Advanced machine learning algorithms',
      vector: [0.15, 0.25, 0.35, 0.25],
      mimeType: 'text/plain',
      webViewLink: 'https://drive.google.com/file/d/file3',
      metadata: {
        modifiedTime: '2023-01-03T00:00:00Z',
        extractedAt: '2023-01-03T00:00:00Z',
      },
    },
  ]

  describe('cosineSimilarity', () => {
    it('should calculate cosine similarity correctly for identical vectors', () => {
      const vector1 = [1, 0, 0, 0]
      const vector2 = [1, 0, 0, 0]
      
      const similarity = cosineSimilarity(vector1, vector2)
      
      expect(similarity).toBe(1)
    })

    it('should calculate cosine similarity correctly for orthogonal vectors', () => {
      const vector1 = [1, 0, 0, 0]
      const vector2 = [0, 1, 0, 0]
      
      const similarity = cosineSimilarity(vector1, vector2)
      
      expect(similarity).toBe(0)
    })

    it('should calculate cosine similarity correctly for opposite vectors', () => {
      const vector1 = [1, 0, 0, 0]
      const vector2 = [-1, 0, 0, 0]
      
      const similarity = cosineSimilarity(vector1, vector2)
      
      expect(similarity).toBe(-1)
    })

    it('should handle normalized vectors correctly', () => {
      const vector1 = [0.6, 0.8]
      const vector2 = [0.6, 0.8]
      
      const similarity = cosineSimilarity(vector1, vector2)
      
      expect(similarity).toBeCloseTo(1, 5)
    })

    it('should throw error for vectors of different lengths', () => {
      const vector1 = [1, 0, 0]
      const vector2 = [1, 0]
      
      expect(() => cosineSimilarity(vector1, vector2)).toThrow('Vectors must have the same length')
    })

    it('should throw error for zero vectors', () => {
      const vector1 = [0, 0, 0]
      const vector2 = [1, 0, 0]
      
      expect(() => cosineSimilarity(vector1, vector2)).toThrow('Cannot compute similarity with zero vector')
    })
  })

  describe('normalizeVector', () => {
    it('should normalize a vector correctly', () => {
      const vector = [3, 4]
      const normalized = normalizeVector(vector)
      
      expect(normalized).toEqual([0.6, 0.8])
    })

    it('should handle already normalized vectors', () => {
      const vector = [0.6, 0.8]
      const normalized = normalizeVector(vector)
      
      expect(normalized[0]).toBeCloseTo(0.6, 5)
      expect(normalized[1]).toBeCloseTo(0.8, 5)
    })

    it('should throw error for zero vector', () => {
      const vector = [0, 0, 0]
      
      expect(() => normalizeVector(vector)).toThrow('Cannot normalize zero vector')
    })
  })

  describe('performSimilaritySearch', () => {
    const searchQuery: VectorSearchQuery = {
      query: 'machine learning algorithms',
      queryVector: [0.12, 0.22, 0.32, 0.34],
      limit: 2,
      similarityThreshold: 0.5,
    }

    it('should return matching embeddings sorted by similarity', async () => {
      const result = await performSimilaritySearch(mockEmbeddings, searchQuery)
      
      expect(result.matches).toHaveLength(2)
      expect(result.matches[0]?.similarity).toBeGreaterThanOrEqual(result.matches[1]?.similarity ?? 0)
      expect(result.totalMatches).toBe(2)
      expect(result.searchTime).toBeGreaterThan(0)
    })

    it('should filter by similarity threshold', async () => {
      const highThresholdQuery: VectorSearchQuery = {
        ...searchQuery,
        similarityThreshold: 0.995, // Higher threshold to actually filter out results
      }
      
      const result = await performSimilaritySearch(mockEmbeddings, highThresholdQuery)
      
      expect(result.matches).toHaveLength(0)
      expect(result.totalMatches).toBe(0)
    })

    it('should limit results correctly', async () => {
      const limitedQuery: VectorSearchQuery = {
        ...searchQuery,
        limit: 1,
        similarityThreshold: 0,
      }
      
      const result = await performSimilaritySearch(mockEmbeddings, limitedQuery)
      
      expect(result.matches).toHaveLength(1)
    })

    it('should assign relevance levels based on similarity', async () => {
      const result = await performSimilaritySearch(mockEmbeddings, {
        ...searchQuery,
        similarityThreshold: 0,
        limit: 3,
      })
      
      result.matches.forEach(match => {
        if (match.similarity >= 0.8) {
          expect(match.relevance).toBe('high')
        } else if (match.similarity >= 0.6) {
          expect(match.relevance).toBe('medium')
        } else {
          expect(match.relevance).toBe('low')
        }
      })
    })

    it('should handle empty embeddings array', async () => {
      const result = await performSimilaritySearch([], searchQuery)
      
      expect(result.matches).toHaveLength(0)
      expect(result.totalMatches).toBe(0)
    })

    it('should handle query with no similar results', async () => {
      const dissimilarQuery: VectorSearchQuery = {
        query: 'completely different topic',
        queryVector: [-1, -1, -1, -1], // Completely opposite vector
        similarityThreshold: 0.9,
      }
      
      const result = await performSimilaritySearch(mockEmbeddings, dissimilarQuery)
      
      expect(result.matches).toHaveLength(0)
    })

    it('should measure search time accurately', async () => {
      const result = await performSimilaritySearch(mockEmbeddings, searchQuery)
      
      expect(result.searchTime).toBeGreaterThan(0)
      expect(result.searchTime).toBeLessThan(1000) // Should be fast
    })
  })
}) 