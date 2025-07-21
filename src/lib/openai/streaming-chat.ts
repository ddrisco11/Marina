import OpenAI from 'openai'
import type { ChatCompletionMessageParam } from 'openai/resources/chat/index'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export interface ChatStreamOptions {
  systemPrompt?: string
  userPrompt: string
  contextDocs?: string[]
  onToken: (token: string) => void
  onDone?: () => void
  onError?: (err: Error) => void
}

export async function streamChatCompletion({
  systemPrompt = 'You are Marina, an AI assistant that answers questions about the user\'s Google Drive files. Always cite sources as [filename](link) when relevant.',
  userPrompt,
  contextDocs = [],
  onToken,
  onDone,
  onError,
}: ChatStreamOptions) {
  try {
    const contextString = contextDocs.length > 0
      ? `\n\nContext from user\'s files:\n${contextDocs.join('\n---\n')}`
      : ''
    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt + contextString },
    ]
    const stream = await openai.chat.completions.create({
      model: 'gpt-4-turbo',
      messages,
      stream: true,
      temperature: 0.2,
      max_tokens: 1024,
    })
    for await (const chunk of stream) {
      const token = chunk.choices?.[0]?.delta?.content || ''
      if (token) onToken(token)
    }
    onDone?.()
  } catch (err: any) {
    onError?.(err)
  }
} 