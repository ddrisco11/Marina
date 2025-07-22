import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import '../styles/globals.css'
import dynamic from 'next/dynamic'

const Providers = dynamic(
  () => import('@/components/providers/session-provider'),
  {
    ssr: false
  }
)

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Marina - AI-Powered Document Chat',
  description: 'Chat with your Google Drive documents using AI',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Providers>
          <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
            {children}
          </div>
        </Providers>
      </body>
    </html>
  )
} 