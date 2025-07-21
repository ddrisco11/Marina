'use client'

import { useSession, signIn, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import Image from 'next/image'

export default function AuthButton() {
  const { data: session, status } = useSession()
  const router = useRouter()

  if (status === 'loading') {
    return (
      <Button disabled size="lg" className="text-lg px-8 py-6">
        Loading...
      </Button>
    )
  }

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

  return (
    <Button 
      size="lg" 
      className="text-lg px-8 py-6 bg-blue-600 hover:bg-blue-700 text-white"
      onClick={() => signIn('google')}
    >
      🔐 Sign in with Google
    </Button>
  )
} 