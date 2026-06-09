// src/app/api/assistant/route.ts
import Anthropic from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { TOOL_SCHEMAS, isReadTool, executeReadTool } from '@/lib/assistant/tools'

type ChatMessage = { role: 'user' | 'assistant'; content: string }

const SYSTEM_PROMPT = `You are the TimeWiseHub AI assistant. You have access to the user's real data: tasks, projects, clients, time entries, expenses, leave, calendar, and team members. You can read data and propose actions (the user confirms before anything changes).

Rules:
- At the start of every new session (first user message), call get_summary to load context before responding.
- For write actions, call the appropriate tool. The system will show the user a confirmation card — you do not need to ask for permission in text.
- After proposing a write action, briefly explain what you proposed and wait for the result.
- If a write action fails, say so clearly and suggest alternatives.
- Never guess at UUIDs. Fetch the data first to get IDs.
- Be concise and practical. This is a productivity tool, not a chat app.
- If the user reports a bug, tell them to use the "Report a bug" button below and include what they were doing.

TimeWiseHub features: time tracking, expenses, projects, tasks, leave, calendar, clients, invoices, finance, team chat, reports, billing.`

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey || apiKey === 'replace-with-your-anthropic-api-key') {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY is not configured.' }, { status: 500 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let messages: ChatMessage[]
  try {
    const body = await request.json()
    messages = Array.isArray(body.messages) ? body.messages : []
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const cleanMessages = messages
    .filter(m => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-20)
    .map(m => ({ role: m.role, content: m.content.trim() }))

  if (!cleanMessages.length || cleanMessages[cleanMessages.length - 1].role !== 'user') {
    return NextResponse.json({ error: 'A user message is required.' }, { status: 400 })
  }

  const anthropic = new Anthropic({ apiKey })

  // Phase 1: non-streaming call to resolve tool calls
  let currentMessages: Anthropic.MessageParam[] = cleanMessages
  let iterations = 0
  const MAX_ITERATIONS = 5

  try {
  while (iterations < MAX_ITERATIONS) {
    iterations++
    const result = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: TOOL_SCHEMAS,
      messages: currentMessages,
    })

    const toolUseBlocks = result.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
    const textBlocks = result.content.filter((b): b is Anthropic.TextBlock => b.type === 'text')

    if (toolUseBlocks.length === 0) {
      const text = textBlocks.map(b => b.text).join('')
      const encoder = new TextEncoder()
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode(text))
          controller.close()
        },
      })
      return new Response(stream, {
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' },
      })
    }

    const readTools = toolUseBlocks.filter(b => isReadTool(b.name))
    const writeTools = toolUseBlocks.filter(b => !isReadTool(b.name))

    if (writeTools.length > 0) {
      const preamble = textBlocks.map(b => b.text).join('')
      const sentinels = writeTools
        .map(t => `\n__ACTION__:${JSON.stringify({ tool: t.name, input: t.input, id: t.id })}`)
        .join('')
      const encoder = new TextEncoder()
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode(preamble + sentinels))
          controller.close()
        },
      })
      return new Response(stream, {
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' },
      })
    }

    const toolResults: Anthropic.ToolResultBlockParam[] = await Promise.all(
      readTools.map(async tool => {
        const data = await executeReadTool(tool.name, tool.input as Record<string, unknown>, supabase, user.id)
        return {
          type: 'tool_result' as const,
          tool_use_id: tool.id,
          content: JSON.stringify(data),
        }
      }),
    )

    currentMessages = [
      ...currentMessages,
      { role: 'assistant' as const, content: result.content },
      { role: 'user' as const, content: toolResults },
    ]
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode("I wasn't able to complete that in the expected number of steps. Please try again."))
      controller.close()
    },
  })
  return new Response(stream, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' },
  })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'AI error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
