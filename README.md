# Marina 🌊

A modern AI-powered chat interface that seamlessly integrates with Google Drive for intelligent document search and conversation.

## Features

✨ **AI-Powered Chat**: Conversations with GPT-4 Turbo with streaming responses  
📁 **Google Drive Integration**: Automatic indexing and search across all your Drive files  
🔍 **Vector Search**: Advanced semantic search using OpenAI embeddings  
📎 **Smart Citations**: Contextual file references with direct links  
🔐 **Secure Authentication**: Google OAuth2 login  
⚡ **Modern Stack**: Next.js 14, TypeScript, Tailwind CSS, tRPC  
🚀 **Incremental Embeddings**: Smart processing that only creates embeddings for new/modified files

## Incremental Embeddings System

Marina includes an intelligent incremental embeddings system that optimizes performance and reduces API costs:

### How It Works

1. **Smart Detection**: When processing embeddings, Marina first checks for existing embeddings stored in your Google Drive
2. **File Comparison**: Each file is compared against existing embeddings using:
   - File ID matching
   - Modification timestamp comparison
3. **Selective Processing**: Only processes files that are:
   - **New files** (no existing embedding)
   - **Modified files** (changed since last embedding)
4. **Preservation**: Existing up-to-date embeddings are preserved and combined with new ones

### Benefits

- ⚡ **Faster Processing**: Skip re-embedding unchanged files
- 💰 **Cost Efficient**: Reduce OpenAI API calls by avoiding duplicate processing  
- 🔄 **Automatic Updates**: Modified files are automatically re-processed
- 📊 **Progress Tracking**: Real-time feedback showing what's being skipped vs processed

### Example Processing Log

```
📊 Embedding Summary:
  - Total files: 15
  - Existing embeddings: 12
  - Files to embed: 3
  - Files to skip: 12

🚀 Processing 3 files in batches of 5
  ✅ document1.pdf: Up to date (skipping)
  ✅ document2.pdf: Up to date (skipping)  
  🔄 document3.pdf: Modified since last embedding
  ➕ document4.pdf: New file (no existing embedding)
  ➕ document5.pdf: New file (no existing embedding)
```

This system ensures that embeddings are always up-to-date while minimizing unnecessary processing.

## Architecture

Marina follows Clean Architecture principles with:

- **Presentation Layer**: React components and Next.js pages
- **Application Layer**: tRPC routers and React hooks  
- **Domain Layer**: Business logic services
- **Infrastructure Layer**: External APIs (Google Drive, OpenAI)

## Prerequisites

### 1. Install Node.js

Marina requires Node.js 18 or higher. Install it from [nodejs.org](https://nodejs.org/) or using a package manager:

```bash
# macOS with Homebrew
brew install node

# Windows with Chocolatey  
choco install nodejs

# Linux with package manager
sudo apt-get install nodejs npm
```

### 2. Google Cloud Console Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable the following APIs:
   - Google Drive API
   - Google+ API (for authentication)

#### OAuth2 Credentials
1. Navigate to **APIs & Services > Credentials**
2. Click **Create Credentials > OAuth 2.0 Client IDs**
3. Set application type to **Web application**
4. Add authorized origins:
   - `http://localhost:3000` (development)
   - `https://your-app-name.onrender.com` (production)
5. Add authorized redirect URIs:
   - `http://localhost:3000/api/auth/callback/google` (development)
   - `https://your-app-name.onrender.com/api/auth/callback/google` (production)
6. Save the **Client ID** and **Client Secret**

#### Drive API Key
1. In **APIs & Services > Credentials**
2. Click **Create Credentials > API Key**
3. Restrict the key to Google Drive API
4. Save the **API Key**

### 3. OpenAI API Key

1. Go to [OpenAI Platform](https://platform.openai.com/)
2. Navigate to **API Keys**
3. Create a new secret key
4. Save the **API Key** (starts with `sk-`)

## Installation

### 1. Clone and Setup

```bash
git clone <your-repo-url>
cd Marina
npm install
```

### 2. Environment Configuration

Copy the environment template:

```bash
cp .env.local.example .env.local
```

Edit `.env.local` with your credentials:

```env
# NextAuth.js Configuration
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-super-secret-nextauth-secret-key-here

# Google OAuth2 Credentials
GOOGLE_CLIENT_ID=your-google-oauth-client-id
GOOGLE_CLIENT_SECRET=your-google-oauth-client-secret

# Google Drive API
GOOGLE_DRIVE_API_KEY=your-google-drive-api-key

# OpenAI API Configuration  
OPENAI_API_KEY=your-openai-api-key

# Application Environment
NODE_ENV=development
```

### 3. Generate NextAuth Secret

```bash
openssl rand -base64 32
```

Use the output as your `NEXTAUTH_SECRET`.

## Development

### Start Development Server

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) to see Marina in action.

### Run Tests

```bash
# Run all tests
npm test

# Watch mode for development
npm run test:watch

# Coverage report
npm run test:coverage
```

### Linting and Formatting

```bash
# Check linting
npm run lint

# Fix linting issues
npm run lint:fix

# Format code
npm run format

# Check formatting
npm run format:check
```

### Type Checking

```bash
npm run type-check
```

## Project Structure

```
Marina/
├── src/
│   ├── app/                 # Next.js App Router pages
│   ├── components/          # React components
│   │   ├── ui/             # Base UI components
│   │   ├── chat/           # Chat interface
│   │   ├── auth/           # Authentication
│   │   └── layout/         # Layout components
│   ├── lib/                # Utilities and integrations
│   │   ├── trpc/           # tRPC configuration
│   │   ├── google-drive/   # Drive API integration
│   │   ├── openai/         # OpenAI services
│   │   ├── embeddings/     # Vector search
│   │   └── hooks/          # Custom React hooks
│   ├── server/             # Server-side logic
│   │   ├── api/            # tRPC API routes
│   │   ├── services/       # Business logic
│   │   └── middleware/     # Server middleware
│   ├── types/              # TypeScript definitions
│   └── __tests__/          # Test files
├── public/
│   └── assets/             # Static images (auto-imported)
└── docs/                   # Documentation
```

## How It Works

### 1. Authentication Flow
1. User clicks "Login with Google"
2. OAuth2 flow redirects to Google
3. User grants Drive access permissions
4. Session created with NextAuth.js

### 2. Drive Embeddings Pipeline
1. **Login Trigger**: On each login, search Drive for `marina-embeddings.json`
2. **Existing Embeddings**: If found, download and load into memory
3. **Fresh Indexing**: If not found:
   - Scan all Drive files
   - Extract text content from supported formats
   - Generate OpenAI embeddings for each file
   - Save embeddings as `marina-embeddings.json` to Drive

### 3. Chat Interface
1. **User Query**: User types a question
2. **Vector Search**: Query converted to embedding, semantic search performed
3. **Context Retrieval**: Most relevant file content retrieved
4. **AI Response**: GPT-4 Turbo generates response with context
5. **Citations**: Response includes links to source files

### Supported File Types
- **Text**: `.txt`, `.md`, `.csv`
- **Google Workspace**: Docs, Sheets, Slides
- **Microsoft Office**: Word, Excel, PowerPoint
- **Code**: `.js`, `.ts`, `.py`, `.json`
- **Documents**: PDF (text extraction)
- **Web**: HTML files

## Deployment on Render

### 1. Prepare for Deployment

Create `render.yaml` (already included):

```yaml
services:
  - type: web
    name: marina
    env: node
    plan: starter
    buildCommand: npm ci && npm run build
    startCommand: npm start
    envVars:
      - key: NODE_ENV
        value: production
      - key: NEXTAUTH_URL
        fromService:
          type: web
          name: marina
          property: host
```

### 2. Deploy to Render

1. **Connect Repository**:
   - Go to [Render Dashboard](https://dashboard.render.com/)
   - Click **New > Web Service**
   - Connect your GitHub repository

2. **Configure Environment**:
   - Set all environment variables from your `.env.local`
   - Update `NEXTAUTH_URL` to your Render URL: `https://your-app-name.onrender.com`

3. **Update Google OAuth**:
   - Add your Render URL to authorized origins in Google Cloud Console
   - Add redirect URI: `https://your-app-name.onrender.com/api/auth/callback/google`

4. **Deploy**:
   - Render will automatically build and deploy
   - Check logs for any deployment issues

### 3. Post-Deployment

1. **Test Authentication**: Verify Google login works
2. **Check Drive Access**: Confirm file scanning works
3. **Test Chat**: Ensure AI responses include citations

## Static Assets

Drop images into `public/assets/` and import them:

```tsx
import Image from 'next/image'
import logo from '@/assets/logo.png'

export function Header() {
  return (
    <Image 
      src={logo} 
      alt="Marina Logo" 
      width={120} 
      height={40}
    />
  )
}
```

## API Routes

Marina exposes these tRPC endpoints:

- `auth.getSession` - Get current user session
- `drive.scanFiles` - Scan Drive for files
- `embeddings.generate` - Generate embeddings for files
- `embeddings.search` - Perform vector search
- `chat.sendMessage` - Send chat message with RAG

## Troubleshooting

### Common Issues

**Authentication Failed**
- Verify Google OAuth credentials
- Check redirect URIs match exactly
- Ensure APIs are enabled in Google Cloud Console

**Drive Access Denied**
- User needs to grant Drive permissions during OAuth
- Check Drive API quotas in Google Cloud Console

**OpenAI API Errors**
- Verify API key is valid and has credits
- Check rate limits and usage

**Embeddings Not Loading**
- Check Drive permissions for `marina-embeddings.json`
- Verify file format is valid JSON
- Look for quota/rate limit errors

### Logs and Debugging

```bash
# Development logs
npm run dev

# Production logs on Render
# Check the Render dashboard logs section
```

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Write tests for your changes
4. Ensure all tests pass: `npm test`
5. Commit changes: `git commit -m 'Add amazing feature'`
6. Push to branch: `git push origin feature/amazing-feature`
7. Open a Pull Request

## License

MIT License - see [LICENSE](LICENSE) file for details.

---

**Built with ❤️ using Next.js 14, TypeScript, Tailwind CSS, tRPC, and OpenAI**
