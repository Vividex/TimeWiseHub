// src/app/api/assistant/route.ts
import Anthropic from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { TOOL_SCHEMAS, isReadTool, executeReadTool } from '@/lib/assistant/tools'

type ChatMessage = { role: 'user' | 'assistant'; content: string }

const SYSTEM_PROMPT_BASE = `You are the TimeWiseHub AI assistant — friendly, warm, and conversational. You have access to the user's real data: tasks, projects, clients, time entries, expenses, leave, calendar, and team members. You can read that data and propose actions (the user confirms before anything is changed).

Tone and style:
- Talk like a helpful colleague, not a form. Use short, natural sentences.
- Never use bullet-point checklists or markdown tables when a plain sentence works.
- Ask for one thing at a time. Don't dump a list of required vs optional fields.
- When you have enough to act, just propose the action — don't ask for confirmation in text (the UI shows a confirm card).
- Keep responses short. One or two sentences is usually perfect.

Handling technical details (never expose these to the user):
- Colours: ask "what colour?" and accept answers like "blue", "green", "red", "purple", "orange", "yellow", "pink", "teal", "dark", "light". Map them yourself: blue→#2563eb, green→#16a34a, red→#dc2626, purple→#9333ea, orange→#ea580c, yellow→#ca8a04, pink→#db2777, teal→#0891b2, dark→#1e293b, light→#e2e8f0. If they say a colour name not in that list, pick the closest one.
- Dates and times: accept natural language ("next Friday", "end of month", "15th", "now", "right now") and convert yourself. The current datetime is provided at the top of each request — use it exactly for "now" / "right now" / "immediately"; derive relative dates from it for everything else.
- UUIDs: never ask for or mention IDs. Fetch data first to get them silently.
- Never mention API field names, formats, or technical constraints.

Conversation flow:
- Call get_summary only when you genuinely need an overview (overdue tasks, today's hours, active timer). Don't call it for every message — only when context would help.
- After a write action succeeds, give a brief friendly confirmation ("Done! I've created that project for you.").
- If something fails, explain it simply and suggest what to try next.
- If the user reports a bug, gently point them to the "Report a bug" button and ask what they were doing.

TimeWiseHub features: time tracking, expenses, projects, tasks, leave, calendar, clients, invoices, finance, team chat, reports, billing.`

function buildSystemPrompt() {
  return `Current datetime (UTC): ${new Date().toISOString()}\n\n${SYSTEM_PROMPT_BASE}`
}

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
  const encoder = new TextEncoder()
  // Compute once per request so the datetime is consistent across tool-resolution iterations
  const systemPrompt = buildSystemPrompt()

  const responseStream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let currentMessages: Anthropic.MessageParam[] = cleanMessages
      const MAX_ITERATIONS = 5

      try {
        for (let i = 0; i < MAX_ITERATIONS; i++) {
          // Use streaming for every call so text reaches the client as soon as the
          // model starts generating — rather than buffering the full response first.
          const finalMessage = await anthropic.messages
            .stream({
              model: 'claude-haiku-4-5-20251001',
              max_tokens: 1024,
              system: systemPrompt,
              tools: TOOL_SCHEMAS,
              messages: currentMessages,
            })
            .on('text', (text) => controller.enqueue(encoder.encode(text)))
            .finalMessage()

          const toolUseBlocks = finalMessage.content.filter(
            (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
          )

          // No tool use — text was already forwarded to the client token by token
          if (toolUseBlocks.length === 0) break

          // Write tools — text preamble already streamed; append the action sentinel
          const writeTools = toolUseBlocks.filter(b => !isReadTool(b.name))
          if (writeTools.length > 0) {
            const sentinels = writeTools
              .map(t => `\n__ACTION__:${JSON.stringify({ tool: t.name, input: t.input, id: t.id })}`)
              .join('')
            controller.enqueue(encoder.encode(sentinels))
            break
          }

          // Read tools — execute in parallel, add results, loop for text response
          const toolResults: Anthropic.ToolResultBlockParam[] = await Promise.all(
            toolUseBlocks.map(async tool => ({
              type: 'tool_result' as const,
              tool_use_id: tool.id,
              content: JSON.stringify(
                await executeReadTool(tool.name, tool.input as Record<string, unknown>, supabase, user.id),
              ),
            })),
          )

          currentMessages = [
            ...currentMessages,
            { role: 'assistant' as const, content: finalMessage.content },
            { role: 'user' as const, content: toolResults },
          ]
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'AI error'
        controller.enqueue(encoder.encode(message))
      } finally {
        controller.close()
      }
    },
  })

  return new Response(responseStream, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' },
  })
}
