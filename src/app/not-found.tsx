import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function NotFound() {
  return (
    <div className="container mx-auto px-4 py-24">
      <div className="max-w-2xl mx-auto text-center">
        <div className="mb-8">
          <h1 className="text-9xl font-bold text-blue-600 mb-4">404</h1>
          <h2 className="text-3xl font-bold text-gray-900 mb-4">
            Page Not Found
          </h2>
          <p className="text-xl text-gray-600 mb-8">
            Looks like this page sailed away! 🌊
          </p>
        </div>
        
        <div className="bg-white p-8 rounded-lg shadow-md">
          <div className="text-6xl mb-4">🧭</div>
          <h3 className="text-xl font-semibold mb-4">Lost at Sea?</h3>
          <p className="text-gray-600 mb-6">
            Don't worry! Marina can help you navigate back to safe waters.
          </p>
          
          <Link href="/">
            <Button size="lg" className="bg-blue-600 hover:bg-blue-700 text-white">
              🏠 Return to Marina
            </Button>
          </Link>
        </div>
      </div>
    </div>
  )
} 