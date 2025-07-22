import { NextResponse } from 'next/server'
import { NextRequest } from 'next/server'
import OpenAI from 'openai'
import { google } from 'googleapis'

interface HealthStatus {
  openai: {
    status: 'ok' | 'error'
    error?: string
  }
  googleDrive: {
    status: 'ok' | 'error'
    error?: string
    mode?: string
  }
  authentication: {
    accessTokenPresent: boolean
    accessTokenLength?: number
    accessTokenPreview?: string
  }
  environment: {
    openaiKeyPresent: boolean
    googleDriveApiKeyPresent: boolean
    googleOAuth: {
      clientIdPresent: boolean
      clientSecretPresent: boolean
      refreshTokenPresent: boolean
      redirectUriPresent: boolean
    }
  }
}

function getAccessToken(req: NextRequest): string | null {
  const authHeader = req.headers.get('authorization')
  if (!authHeader) return null
  const match = authHeader.match(/^Bearer (.+)$/)
  return match?.[1] ?? null
}

async function testGoogleDriveAccess(accessToken: string) {
  try {
    console.log('Testing Google Drive access...')
    const auth = new google.auth.OAuth2()
    auth.setCredentials({ access_token: accessToken })
    const drive = google.drive({ version: 'v3', auth })
    
    // Test basic Drive access
    const response = await drive.about.get({
      fields: 'user,storageQuota'
    })
    
    console.log('Google Drive test successful:', {
      user: response.data.user?.displayName,
      email: response.data.user?.emailAddress
    })
    
    return {
      status: 'ok' as const,
      userInfo: {
        name: response.data.user?.displayName,
        email: response.data.user?.emailAddress
      }
    }
  } catch (error: any) {
    console.error('Google Drive test failed:', {
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data
    })
    
    return {
      status: 'error' as const,
      error: error.message,
      statusCode: error.response?.status
    }
  }
}

export async function GET(req: NextRequest) {
  console.log('Health check starting...')
  
  // Get access token from request
  const accessToken = getAccessToken(req)
  
  // Initialize status object
  const status: HealthStatus = {
    openai: { status: 'error' },
    googleDrive: { status: 'error' },
    authentication: {
      accessTokenPresent: !!accessToken,
      ...(accessToken && {
        accessTokenLength: accessToken.length,
        accessTokenPreview: accessToken.substring(0, 20) + '...'
      })
    },
    environment: {
      openaiKeyPresent: Boolean(process.env.OPENAI_API_KEY),
      googleDriveApiKeyPresent: Boolean(process.env.GOOGLE_DRIVE_API_KEY),
      googleOAuth: {
        clientIdPresent: Boolean(process.env.GOOGLE_CLIENT_ID),
        clientSecretPresent: Boolean(process.env.GOOGLE_CLIENT_SECRET),
        refreshTokenPresent: Boolean(process.env.GOOGLE_REFRESH_TOKEN),
        redirectUriPresent: Boolean(process.env.GOOGLE_REDIRECT_URI),
      }
    }
  }

  // Check OpenAI
  if (!process.env.OPENAI_API_KEY) {
    console.log('OpenAI validation: Missing API key')
    status.openai.error = 'Missing OPENAI_API_KEY'
  } else {
    try {
      console.log('OpenAI validation: Testing API key')
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
      const testEmbed = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: 'test',
        encoding_format: 'float',
      })
      const embedding = testEmbed.data?.[0]?.embedding
      if (embedding && embedding.length > 0) {
        status.openai.status = 'ok'
      } else {
        status.openai.error = 'Invalid embedding response'
      }
    } catch (err: any) {
      console.error('OpenAI validation error:', err.stack || err)
      status.openai.error = err.message
    }
  }

  // Check Google Drive with user's access token
  if (accessToken) {
    try {
      const driveTest = await testGoogleDriveAccess(accessToken)
      if (driveTest.status === 'ok') {
        status.googleDrive.status = 'ok'
        status.googleDrive.mode = 'User OAuth Token'
      } else {
        status.googleDrive.error = driveTest.error
        status.googleDrive.mode = 'User OAuth Token (Failed)'
      }
    } catch (err: any) {
      console.error('Google Drive validation error:', err.stack || err)
      status.googleDrive.error = err.message
      status.googleDrive.mode = 'User OAuth Token (Error)'
    }
  } else {
    status.googleDrive.error = 'No access token provided'
    status.googleDrive.mode = 'No Authentication'
  }

  // Determine HTTP status based on both services
  const httpStatus = 
    status.openai.status === 'ok' && status.googleDrive.status === 'ok'
      ? 200
      : (status.openai.error?.toLowerCase().includes('auth') || 
         status.googleDrive.error?.toLowerCase().includes('auth'))
        ? 401
        : 500

  console.log('Health check complete:', {
    openai: status.openai.status,
    googleDrive: status.googleDrive.status,
    httpStatus
  })

  return NextResponse.json(status, { status: httpStatus })
} 