import { Button } from '@/components/ui/button'

export default function HomePage() {
  return (
    <div className="container mx-auto px-4 py-12">
      <div className="max-w-4xl mx-auto text-center">
        {/* Hero Section */}
        <div className="mb-12">
          <h1 className="text-6xl font-bold text-gray-900 mb-4">
            🌊 Marina
          </h1>
          <p className="text-2xl text-gray-600 mb-6">
            AI-Powered Chat for Your Google Drive
          </p>
          <p className="text-lg text-gray-500 max-w-2xl mx-auto mb-8">
            Connect your Google Drive and chat with your documents using advanced AI. 
            Marina understands your files and provides intelligent answers with citations.
          </p>
          
          {/* Login Button */}
          <div className="mb-12">
            <Button 
              size="lg" 
              className="text-lg px-8 py-6 bg-blue-600 hover:bg-blue-700 text-white"
            >
              🔐 Sign in with Google
            </Button>
          </div>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-3 gap-8 mb-12">
          <div className="bg-white p-6 rounded-lg shadow-md">
            <div className="text-4xl mb-4">🔍</div>
            <h3 className="text-xl font-semibold mb-2">Smart Search</h3>
            <p className="text-gray-600">
              Find information across all your documents using natural language queries
            </p>
          </div>
          
          <div className="bg-white p-6 rounded-lg shadow-md">
            <div className="text-4xl mb-4">🤖</div>
            <h3 className="text-xl font-semibold mb-2">AI-Powered</h3>
            <p className="text-gray-600">
              Powered by OpenAI GPT-4 Turbo and advanced vector embeddings
            </p>
          </div>
          
          <div className="bg-white p-6 rounded-lg shadow-md">
            <div className="text-4xl mb-4">📄</div>
            <h3 className="text-xl font-semibold mb-2">File Citations</h3>
            <p className="text-gray-600">
              Get answers with direct links to the source documents in your Drive
            </p>
          </div>
        </div>

        {/* Supported Files */}
        <div className="bg-white p-8 rounded-lg shadow-md">
          <h3 className="text-2xl font-bold mb-6">Supported File Types</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div className="text-center">
              <div className="text-2xl mb-2">📄</div>
              <p>PDF Documents</p>
            </div>
            <div className="text-center">
              <div className="text-2xl mb-2">📊</div>
              <p>Spreadsheets</p>
            </div>
            <div className="text-center">
              <div className="text-2xl mb-2">📝</div>
              <p>Text Files</p>
            </div>
            <div className="text-center">
              <div className="text-2xl mb-2">📋</div>
              <p>Presentations</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
} 