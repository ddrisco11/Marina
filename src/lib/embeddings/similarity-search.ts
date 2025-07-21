import type { Embedding, VectorSearchQuery, VectorSearchResult, EmbeddingMatch } from '@/types/embeddings'

/**
 * Calculate the cosine similarity between two vectors
 * Returns a value between -1 and 1, where 1 is identical, 0 is orthogonal, and -1 is opposite
 */
export function cosineSimilarity(vectorA: number[], vectorB: number[]): number {
  if (vectorA.length !== vectorB.length) {
    throw new Error('Vectors must have the same length')
  }

  const dotProduct = vectorA.reduce((sum, a, i) => sum + a * (vectorB[i] ?? 0), 0)
  const magnitudeA = Math.sqrt(vectorA.reduce((sum, a) => sum + a * a, 0))
  const magnitudeB = Math.sqrt(vectorB.reduce((sum, b) => sum + b * b, 0))

  if (magnitudeA === 0 || magnitudeB === 0) {
    throw new Error('Cannot compute similarity with zero vector')
  }

  return dotProduct / (magnitudeA * magnitudeB)
}

/**
 * Normalize a vector to unit length
 */
export function normalizeVector(vector: number[]): number[] {
  const magnitude = Math.sqrt(vector.reduce((sum, component) => sum + component * component, 0))
  
  if (magnitude === 0) {
    throw new Error('Cannot normalize zero vector')
  }

  return vector.map(component => component / magnitude)
}

/**
 * Determine relevance level based on similarity score
 */
function getRelevanceLevel(similarity: number): 'high' | 'medium' | 'low' {
  if (similarity >= 0.8) return 'high'
  if (similarity >= 0.6) return 'medium'
  return 'low'
}

/**
 * Perform vector similarity search against a collection of embeddings
 */
export async function performSimilaritySearch(
  embeddings: Embedding[],
  query: VectorSearchQuery
): Promise<VectorSearchResult> {
  const startTime = performance.now()

  if (embeddings.length === 0) {
    return {
      matches: [],
      totalMatches: 0,
      searchTime: performance.now() - startTime,
    }
  }

  // Calculate similarity for each embedding
  const similarities: EmbeddingMatch[] = embeddings
    .map((embedding): EmbeddingMatch | null => {
      try {
        const similarity = cosineSimilarity(query.queryVector, embedding.vector)
        return {
          embedding,
          similarity,
          relevance: getRelevanceLevel(similarity),
        }
      } catch (error) {
        // Skip invalid embeddings (e.g., zero vectors)
        return null
      }
    })
    .filter((match): match is EmbeddingMatch => match !== null)

  // Apply similarity threshold filter
  const threshold = query.similarityThreshold ?? 0
  const filteredMatches = similarities.filter(match => match.similarity >= threshold)

  // Sort by similarity (highest first)
  filteredMatches.sort((a, b) => b.similarity - a.similarity)

  // Apply limit
  const limit = query.limit ?? filteredMatches.length
  const limitedMatches = filteredMatches.slice(0, limit)

  const searchTime = performance.now() - startTime

  return {
    matches: limitedMatches,
    totalMatches: filteredMatches.length,
    searchTime,
  }
} 