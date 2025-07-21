import { google } from 'googleapis'
import type { DriveFile, EmbeddingsFile } from '@/types/embeddings'

// Supported file types for text extraction
const SUPPORTED_MIME_TYPES = new Set([
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/vnd.google-apps.document',
  'application/vnd.google-apps.spreadsheet',
  'application/vnd.google-apps.presentation',
  'text/html',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/json',
  'text/javascript',
  'text/typescript',
  'application/javascript',
])

/**
 * Initialize Google Drive API client with access token
 */
function initializeDriveClient(accessToken: string) {
  const auth = new google.auth.OAuth2()
  auth.setCredentials({ access_token: accessToken })
  return google.drive({ version: 'v3', auth })
}

/**
 * Search for the marina-embeddings.json file in user's Drive
 */
export async function searchEmbeddingsFile(accessToken: string): Promise<DriveFile | null> {
  try {
    const drive = initializeDriveClient(accessToken)
    
    const response = await drive.files.list({
      q: "name='marina-embeddings.json' and trashed=false",
      fields: 'files(id,name,mimeType,modifiedTime)',
      spaces: 'drive',
    })

    const files = response.data.files
    if (!files || files.length === 0) {
      return null
    }

    const file = files[0]
    return {
      id: file.id!,
      name: file.name!,
      mimeType: file.mimeType!,
      modifiedTime: file.modifiedTime!,
    }
  } catch (error) {
    throw new Error(`Failed to search for embeddings file: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Download and parse the marina-embeddings.json file
 */
export async function downloadEmbeddingsFile(accessToken: string, fileId: string): Promise<EmbeddingsFile> {
  try {
    const drive = initializeDriveClient(accessToken)
    
    const response = await drive.files.get({
      fileId,
      alt: 'media',
    })

    const content = response.data as string
    
    try {
      return JSON.parse(content) as EmbeddingsFile
    } catch (parseError) {
      throw new Error('Invalid embeddings file format')
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'Invalid embeddings file format') {
      throw error
    }
    throw new Error(`Failed to download embeddings file: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Upload or update the marina-embeddings.json file to Drive
 */
export async function uploadEmbeddingsFile(
  accessToken: string,
  embeddingsData: EmbeddingsFile,
  existingFileId?: string
): Promise<DriveFile> {
  try {
    const drive = initializeDriveClient(accessToken)
    const content = JSON.stringify(embeddingsData, null, 2)

    if (existingFileId) {
      // Update existing file
      const response = await drive.files.update({
        fileId: existingFileId,
        media: {
          mimeType: 'application/json',
          body: content,
        },
      })

      return {
        id: response.data.id!,
        name: response.data.name!,
        mimeType: 'application/json',
        modifiedTime: new Date().toISOString(),
      }
    } else {
      // Create new file
      const response = await drive.files.create({
        requestBody: {
          name: 'marina-embeddings.json',
          mimeType: 'application/json',
        },
        media: {
          mimeType: 'application/json',
          body: content,
        },
      })

      return {
        id: response.data.id!,
        name: response.data.name!,
        mimeType: 'application/json',
        modifiedTime: new Date().toISOString(),
      }
    }
  } catch (error) {
    throw new Error(`Failed to upload embeddings file: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Scan all files in user's Drive and return supported file types
 */
export async function scanAllFiles(accessToken: string): Promise<DriveFile[]> {
  try {
    const drive = initializeDriveClient(accessToken)
    const allFiles: DriveFile[] = []
    let nextPageToken: string | undefined

    do {
      const response = await drive.files.list({
        pageSize: 100,
        pageToken: nextPageToken,
        q: 'trashed=false',
        fields: 'nextPageToken,files(id,name,mimeType,size,modifiedTime,webViewLink,parents)',
      })

      const files = response.data.files || []
      
      // Filter for supported file types
      const supportedFiles = files
        .filter(file => file.mimeType && SUPPORTED_MIME_TYPES.has(file.mimeType))
        .map(file => ({
          id: file.id!,
          name: file.name!,
          mimeType: file.mimeType!,
          size: file.size ? parseInt(file.size) : undefined,
          modifiedTime: file.modifiedTime!,
          webViewLink: file.webViewLink,
          parents: file.parents,
        }))

      allFiles.push(...supportedFiles)
      nextPageToken = response.data.nextPageToken || undefined
    } while (nextPageToken)

    return allFiles
  } catch (error) {
    throw new Error(`Failed to scan Drive files: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Download content from a specific Drive file
 */
export async function downloadFileContent(accessToken: string, file: DriveFile): Promise<string> {
  try {
    const drive = initializeDriveClient(accessToken)
    
    // Handle Google Workspace files (need export)
    if (file.mimeType === 'application/vnd.google-apps.document') {
      const response = await drive.files.get({
        fileId: file.id,
        mimeType: 'text/plain',
      })
      return response.data as string
    } else if (file.mimeType === 'application/vnd.google-apps.spreadsheet') {
      const response = await drive.files.get({
        fileId: file.id,
        mimeType: 'text/csv',
      })
      return response.data as string
    } else if (file.mimeType === 'application/vnd.google-apps.presentation') {
      const response = await drive.files.get({
        fileId: file.id,
        mimeType: 'text/plain',
      })
      return response.data as string
    } else {
      // Regular file download
      const response = await drive.files.get({
        fileId: file.id,
        alt: 'media',
      })
      return response.data as string
    }
  } catch (error) {
    // Return empty string on error instead of throwing
    // This allows the process to continue with other files
    return ''
  }
} 