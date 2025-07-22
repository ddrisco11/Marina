import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '../[...nextauth]/route'

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session) {
      return NextResponse.json({ 
        authenticated: false, 
        message: 'No session found' 
      })
    }

    return NextResponse.json({
      authenticated: true,
      user: {
        name: session.user?.name,
        email: session.user?.email,
      },
      accessToken: session.accessToken, // Include the actual access token
      hasAccessToken: !!session.accessToken,
      accessTokenLength: session.accessToken?.length,
      accessTokenPreview: session.accessToken?.substring(0, 20) + '...',
      hasError: !!session.error,
      error: session.error,
      expires: session.expires,
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    console.error('Session check error:', error)
    return NextResponse.json({
      authenticated: false,
      error: error.message,
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
} 