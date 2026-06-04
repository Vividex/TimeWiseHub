import Anthropic from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'

type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
}

const SYSTEM_PROMPT = `You are the onsite AI assistant for TimeWiseHub, a modern business dashboard for teams and individuals.

TimeWiseHub features include:
- Time tracking: start and stop timers, add manual time entries, review today's time, weekly totals, and task-linked work logs.
- Expenses: submit expenses, upload and view receipts, track statuses, manage recurring subscriptions, export expense data, and review manager approvals.
- Projects: create projects, monitor project status, archive completed work, store project documents, and review deadlines.
- Tasks: create task lists, assign work, set due dates, track status, use priority levels, and spot urgent or overdue work.
- Leave: plan and reason about team availability, time away, and how leave affects deadlines and project capacity.
- Calendar: view tasks and events by date, add calendar events, inspect daily schedules, and see upcoming work.
- Billing: manage subscription plans, trials, checkout, customer portal access, and plan limits.
- Reports and insights: review activity, productivity ratios, project health, time and expense summaries, organisation stats, exports, and business performance trends.

Help users understand how to use TimeWiseHub, troubleshoot common workflow issues, and choose the next best action inside the app. Be concise, practical, and specific. If a user asks for private account data you cannot see, explain what page or feature they should open.`

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY

  if (!apiKey || apiKey === 'replace-with-your-anthropic-api-key') {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY is not configured.' }, { status: 500 })
  }

  let messages: ChatMessage[]

  try {
    const body = await request.json()
    messages = Array.isArray(body.messages) ? body.messages : []
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const cleanMessages = messages
    .filter(message =>
      (message.role === 'user' || message.role === 'assistant') &&
      typeof message.content === 'string' &&
      message.content.trim().length > 0,
    )
    .slice(-12)
    .map(message => ({ role: message.role, content: message.content.trim() }))

  if (cleanMessages.length === 0 || cleanMessages[cleanMessages.length - 1].role !== 'user') {
    return NextResponse.json({ error: 'A user message is required.' }, { status: 400 })
  }

  const anthropic = new Anthropic({ apiKey })
  const encoder = new TextEncoder()

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const messageStream = anthropic.messages.stream({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 800,
          system: SYSTEM_PROMPT,
          messages: cleanMessages,
        })

        for await (const event of messageStream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            controller.enqueue(encoder.encode(event.delta.text))
          }
        }

        controller.close()
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Assistant request failed.'
        controller.enqueue(encoder.encode(`\n\n${message}`))
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
    },
  })
}
