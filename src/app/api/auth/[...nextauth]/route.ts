import NextAuth from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'
import type { NextAuthOptions } from 'next-auth'

async function refreshAccessToken(token: any) {
  try {
    console.log('🔧 REFRESH: Starting token refresh...', {
      hasRefreshToken: !!token.refreshToken,
      refreshTokenLength: token.refreshToken ? token.refreshToken.length : 0
    })
    
    const response = await fetch('https://oauth2.googleapis.com/token', {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      method: 'POST',
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        grant_type: 'refresh_token',
        refresh_token: token.refreshToken,
      }),
    })

    const refreshedTokens = await response.json()

    if (!response.ok) {
      console.error('🔧 REFRESH: Failed to refresh token:', refreshedTokens)
      throw refreshedTokens
    }

    console.log('🔧 REFRESH: Successfully refreshed access token', {
      hasNewAccessToken: !!refreshedTokens.access_token,
      newAccessTokenLength: refreshedTokens.access_token ? refreshedTokens.access_token.length : 0,
      expiresIn: refreshedTokens.expires_in
    })

    return {
      ...token,
      accessToken: refreshedTokens.access_token,
      accessTokenExpires: Date.now() + (refreshedTokens.expires_in || 3600) * 1000,
      refreshToken: refreshedTokens.refresh_token ?? token.refreshToken,
    }
  } catch (error) {
    console.error('🔧 REFRESH: Error refreshing access token:', error)
    return {
      ...token,
      error: 'RefreshAccessTokenError',
    }
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: 'openid email profile https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.readonly',
          access_type: 'offline',
          prompt: 'consent',
        }
      }
    })
  ],
  callbacks: {
    async jwt({ token, account, user }) {
      console.log('🔧 JWT CALLBACK:', {
        hasAccount: !!account,
        hasUser: !!user,
        tokenKeys: token ? Object.keys(token) : [],
        hasAccessToken: !!token.accessToken,
        accessTokenExpires: token.accessTokenExpires,
        currentTime: Date.now()
      })

      // Initial sign in
      if (account && user) {
        console.log('🔧 Initial sign in, storing tokens:', {
          accountAccessToken: account.access_token ? 'PRESENT' : 'MISSING',
          accountRefreshToken: account.refresh_token ? 'PRESENT' : 'MISSING',
          expiresAt: account.expires_at
        })
        return {
          ...token,
          accessToken: account.access_token,
          accessTokenExpires: account.expires_at ? account.expires_at * 1000 : Date.now() + 3600 * 1000,
          refreshToken: account.refresh_token,
        }
      }

      // Return previous token if the access token has not expired yet
      if (Date.now() < (token.accessTokenExpires as number)) {
        console.log('🔧 Access token still valid')
        return token
      }

      // Access token has expired, try to update it
      console.log('🔧 Access token expired, refreshing...')
      return refreshAccessToken(token)
    },
    async session({ session, token }) {
      console.log('🔧 SESSION CALLBACK:', {
        tokenKeys: token ? Object.keys(token) : [],
        hasTokenAccessToken: !!token.accessToken,
        tokenError: token.error,
        sessionKeys: session ? Object.keys(session) : []
      })

      if (token.error === 'RefreshAccessTokenError') {
        console.log('🔧 Refresh token error, user needs to re-authenticate')
        session.error = 'RefreshAccessTokenError'
      } else {
        console.log('🔧 Setting session.accessToken from token:', {
          tokenAccessToken: token.accessToken ? 'PRESENT' : 'MISSING',
          tokenAccessTokenLength: token.accessToken ? token.accessToken.length : 0
        })
        session.accessToken = token.accessToken as string
      }
      
      console.log('🔧 Final session:', {
        sessionKeys: Object.keys(session),
        hasSessionAccessToken: !!session.accessToken,
        sessionAccessTokenLength: session.accessToken ? session.accessToken.length : 0
      })
      
      return session
    },
  },
  pages: {
    signIn: '/',
    error: '/',
  }
}

const handler = NextAuth(authOptions)

export { handler as GET, handler as POST } 