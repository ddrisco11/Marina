import { google } from 'googleapis'
import type { DriveFile, EmbeddingsFile } from '@/types/embeddings'
import type { GaxiosResponse } from 'gaxios'
import type { drive_v3 } from 'googleapis'

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
    if (!files || files.length === 0 || !files[0]) {
      return null
    }

    const file = files[0]
    if (!file.id || !file.name || !file.mimeType || !file.modifiedTime) {
      throw new Error('Invalid file metadata from Drive API')
    }

    return {
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      modifiedTime: file.modifiedTime,
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

    // Handle different response types from Drive API
    let content: string
    if (typeof response.data === 'string') {
      content = response.data
    } else if (typeof response.data === 'object') {
      content = JSON.stringify(response.data)
    } else {
      console.error('Unexpected Drive API response type:', typeof response.data)
      throw new Error('Invalid embeddings file format')
    }
    
    try {
      const parsed = JSON.parse(content)
      
      // Validate the parsed data matches EmbeddingsFile structure
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('Invalid embeddings file format: not an object')
      }
      
      if (!Array.isArray(parsed.embeddings)) {
        throw new Error('Invalid embeddings file format: embeddings not an array')
      }
      
      if (!parsed.version || !parsed.generatedAt || typeof parsed.totalFiles !== 'number') {
        throw new Error('Invalid embeddings file format: missing required fields')
      }
      
      if (!parsed.metadata || typeof parsed.metadata !== 'object' || 
          !parsed.metadata.openaiModel || typeof parsed.metadata.embeddingDimension !== 'number') {
        throw new Error('Invalid embeddings file format: invalid metadata')
      }

      return parsed as EmbeddingsFile
    } catch (parseError) {
      console.error('Error parsing embeddings file:', parseError)
      throw new Error(`Invalid embeddings file format: ${parseError instanceof Error ? parseError.message : 'parse error'}`)
    }
  } catch (error) {
    console.error('Error downloading embeddings file:', error)
    if (error instanceof Error && error.message.startsWith('Invalid embeddings file format')) {
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
    let pageToken: string | null = null

    do {
      const params: drive_v3.Params$Resource$Files$List = {
        pageSize: 100,
        ...(pageToken ? { pageToken } : {}),
        q: 'trashed=false',
        fields: 'nextPageToken,files(id,name,mimeType,size,modifiedTime,webViewLink,parents)',
      }

      const response = await drive.files.list(params)
      const files = response.data.files || []
      
      // Filter for supported file types and ensure required fields
      const supportedFiles = files
        .filter((file): file is drive_v3.Schema$File & { id: string; name: string; mimeType: string; modifiedTime: string } => {
          return Boolean(
            file &&
            file.id &&
            file.name &&
            file.mimeType &&
            SUPPORTED_MIME_TYPES.has(file.mimeType)
          )
        })
        .map(file => ({
          id: file.id,
          name: file.name,
          mimeType: file.mimeType,
          ...(file.size ? { size: parseInt(file.size) } : {}),
          modifiedTime: file.modifiedTime,
          ...(file.webViewLink ? { webViewLink: file.webViewLink } : {}),
          ...(file.parents ? { parents: file.parents } : {}),
        } as DriveFile))

      allFiles.push(...supportedFiles)
      pageToken = response.data.nextPageToken || null
    } while (pageToken)

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
      const params: drive_v3.Params$Resource$Files$Export = {
        fileId: file.id,
        mimeType: 'text/plain',
      }
      const response = await drive.files.export(params) as GaxiosResponse<string>
      return response.data
    } else if (file.mimeType === 'application/vnd.google-apps.spreadsheet') {
      const params: drive_v3.Params$Resource$Files$Export = {
        fileId: file.id,
        mimeType: 'text/csv',
      }
      const response = await drive.files.export(params) as GaxiosResponse<string>
      return response.data
    } else if (file.mimeType === 'application/vnd.google-apps.presentation') {
      const params: drive_v3.Params$Resource$Files$Export = {
        fileId: file.id,
        mimeType: 'text/plain',
      }
      const response = await drive.files.export(params) as GaxiosResponse<string>
      return response.data
    } else {
      // Regular file download
      const params: drive_v3.Params$Resource$Files$Get = {
        fileId: file.id,
        alt: 'media',
      }
      const response = await drive.files.get(params) as GaxiosResponse<string>
      return response.data
    }
  } catch (error) {
    // Return empty string on error instead of throwing
    // This allows the process to continue with other files
    console.error(`Error downloading file ${file.name}:`, error)
    return ''
  }
} 