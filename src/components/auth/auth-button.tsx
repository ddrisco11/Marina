'use client'

import { useSession, signIn, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import Image from 'next/image'
import { useEffect, useState } from 'react'

// Main AuthButton component with proper hydration handling
export default function AuthButton() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [hasMounted, setHasMounted] = useState(false)

  useEffect(() => {
    setHasMounted(true)
  }, [])

  // During SSR and initial hydration, show a consistent placeholder
  if (!hasMounted) {
    return (
      <div className="flex justify-center">
        <div className="h-[68px] w-[240px] bg-gray-100 animate-pulse rounded-md flex items-center justify-center">
          <span className="text-gray-500 text-sm">Loading...</span>
        </div>
      </div>
    )
  }

  // Handle session error (refresh token failed)
  if (session?.error === 'RefreshAccessTokenError') {
    return (
      <div className="flex flex-col items-center space-y-4">
        <div className="text-center text-red-600 bg-red-50 p-4 rounded-lg">
          <p className="font-medium">Session expired</p>
          <p className="text-sm">Please sign in again</p>
        </div>
        <Button 
          size="lg" 
          className="text-lg px-8 py-6 bg-blue-600 hover:bg-blue-700 text-white"
          onClick={() => signOut({ callbackUrl: '/' })}
        >
          🔐 Sign in again
        </Button>
      </div>
    )
  }

  // Loading state
  if (status === 'loading') {
    return (
      <div className="flex justify-center">
        <Button disabled size="lg" className="text-lg px-8 py-6">
          Loading...
        </Button>
      </div>
    )
  }

  // Signed in state
  if (session?.user) {
    return (
      <div className="flex flex-col items-center space-y-4">
        <div className="flex items-center space-x-3 bg-white p-4 rounded-lg shadow-md">
          {session.user.image && (
            <Image
              src={session.user.image}
              alt="Profile"
              width={40}
              height={40}
              className="rounded-full"
            />
          )}
          <div>
            <p className="font-medium text-gray-900">{session.user.name}</p>
            <p className="text-sm text-gray-500">{session.user.email}</p>
          </div>
        </div>
        
        <div className="flex space-x-3">
          <Button 
            size="lg" 
            className="bg-green-600 hover:bg-green-700 text-white"
            onClick={() => router.push('/chat')}
          >
            🚀 Go to Chat
          </Button>
          <Button 
            variant="outline" 
            size="lg" 
            onClick={() => signOut()}
          >
            Sign Out
          </Button>
        </div>
      </div>
    )
  }

  // Not signed in state
  return (
    <div className="flex justify-center">
      <Button 
        size="lg" 
        className="text-lg px-8 py-6 bg-blue-600 hover:bg-blue-700 text-white"
        onClick={() => signIn('google')}
      >
        🔐 Sign in with Google
      </Button>
    </div>
  )
} 