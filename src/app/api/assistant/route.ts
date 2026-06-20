// src/app/api/assistant/route.ts
import Anthropic from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { TOOL_SCHEMAS, isReadTool, executeReadTool } from '@/lib/assistant/tools'
import { getSubscription, isPaidPlan } from '@/lib/subscription'

type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
type ChatMessage = { role: 'user' | 'assistant'; content: string | ContentBlock[] }

const SYSTEM_PROMPT_BASE = `You are the TimeWiseHub AI assistant — friendly, warm, and conversational. You have access to the user's real data and can propose actions (the user confirms before anything is changed).

Tone and style:
- Talk like a helpful colleague, not a form. Use short, natural sentences.
- Never use any markdown formatting — no bold, no italic, no bullet points, no headers, no backticks. Plain text only.
- Ask for one thing at a time. Don't dump a list of required vs optional fields.
- When you have enough to act, just propose the action — the UI shows a confirm card, so don't ask for confirmation in text.
- Keep responses short. One or two sentences is usually perfect.

Handling technical details (never expose these to the user):
- Colours: accept "blue", "green", "red", "purple", "orange", "yellow", "pink", "teal", "dark", "light". Map them yourself: blue→#2563eb, green→#16a34a, red→#dc2626, purple→#9333ea, orange→#ea580c, yellow→#ca8a04, pink→#db2777, teal→#0891b2, dark→#1e293b, light→#e2e8f0.
- Dates and times: accept natural language and convert yourself. The current datetime is injected at the start of every conversation — use it exactly for "now"/"right now"; derive relative dates from it for everything else.
- UUIDs: never ask for or mention IDs. Fetch data first to get them silently.
- Never mention API field names, formats, or technical constraints.

Conversation flow:
- Call get_summary only when you genuinely need an overview (overdue tasks, today's hours, active timer). Don't call it for every message.
- After a write action succeeds, give a brief friendly confirmation.
- If something fails, explain it simply and suggest what to try next.
- If the user reports a bug, gently point them to the "Report a bug" button and ask what they were doing.
- If asked about a section you cannot interact with, explain what it does and tell them where to find it in the sidebar.

TimeWiseHub is organised into these sections in the sidebar:

HOME
Dashboard — overview of your day: overdue tasks, upcoming deadlines, today's logged hours, and your active timer. Use get_summary to answer questions about this.

DELIVERY
Clients — your client list. Each client has a profile (name, email, phone), a session history, and progress notes. Sessions are scheduled appointments with a checklist of to-do items. Progress notes are timestamped records of client updates, outcomes, or clinical notes. You can read clients, create and update client records, fetch sessions, create and update sessions, add to-do items to a session checklist, check or uncheck those to-do items, and add progress notes to a client.
Calendar — personal calendar combining events, project due dates, task deadlines, and leave. You can read events and create new calendar events.
Time — time tracking with a running timer and manual log entries. You can read time entries, log manual entries with a start and end time, and start or stop the running timer.

COMMUNICATION
Chat — team messaging with channels and direct messages. You cannot read or send chat messages. Tell the user to open Chat in the sidebar.
Assistant — this interface.

MONEY
Quotes — you can draft and create quotes for clients. A quote is a formal pricing document numbered Q-YYYY-NNN. How to handle a quote request:
Step 1: Call get_clients to find the right client UUID. If ambiguous, ask which client.
Step 2: Understand the full scope of the job from what the user has told you. Ask one clarifying question if something critical is missing, but do not ask for information you already have.
Step 3: Draft professional line items yourself. Each description should read like a formal scope of works — state the trade or service, describe the work being performed, and include relevant detail like duration, materials scope, or inclusions. Good example: "Builder — supply of labour for shed construction including footings, timber frame, roof structure and wall cladding, estimated 5 days". Poor example: "Builder labour". For multi-trade jobs list each trade separately.
Step 4: Pricing — follow the user's instruction exactly:
- If the user gives a fixed lump-sum total and says not to price individual items: set total to that amount and set unit_price to 0 on every item. Never invent individual prices. Never calculate a subtotal from item prices when a total has been given.
- If the user provides individual rates: set unit_price per item and omit the total field.
Step 5: Deposits and payment terms go in the notes field. Draft professional terms that include the deposit amount (calculated from the total), balance due date, and quote validity. Example: "A deposit of $2,400 (10%) is required prior to commencement of work. The balance of $21,600 is due within 14 days of practical completion. This quote is valid for 30 days from the date of issue."
Step 6: Ask for an expiry date if not specified. Suggest 30 days from today.
Step 7: Propose the quote with create_quote. After confirmation, tell the user the quote number.
Invoices — you can look up invoices and quotes with get_invoices. Statuses are: draft, sent, paid, overdue, cancelled, pending_approval, or quote. You cannot create invoices (only quotes as above). For creating a new invoice, tell the user to go to Invoices in the sidebar.
Expenses — log and categorise business expenses (travel, meals, equipment, etc). Submitted expenses go to a manager for approval. You can read expenses and create new ones.
Finance — shows indicative pay estimates and pay statements for the user, and lets managers approve team timesheets. Figures are estimates only, not official payslips. You cannot read or modify finance data. Tell the user to go to Finance in the sidebar.

PEOPLE
Leave — submit and manage leave requests: annual, sick, personal, unpaid, or other. Managers can approve or reject team leave here. You can read leave requests and submit new ones.
Roster — weekly shift schedule for team members. Managers can view and create shifts. You can read the roster and add shifts.
How to roster someone into a shift:
Step 1: Call get_team_members to find the member's user_id. Never ask the user for a UUID.
Step 2: Call check_availability with that user_id, the target date, and shift times. Always do this step even if the user doesn't ask — it's a quick read.
Step 3a: If is_available is true, propose create_roster_shift immediately.
Step 3b: If is_available is false, clearly state what's blocking the shift — distinguish between the two cases:
- unavailable_hours present: "Sam is not scheduled to work during those hours" (e.g. outside their normal pattern)
- uncontactable_hours present: "Sam is marked uncontactable during those hours" (e.g. in a meeting or focused block)
Both are warnings, not hard blocks. Ask if they'd still like to add the shift. If yes, propose create_roster_shift anyway. If both types are present, mention both.
Time format: always use HH:MM 24-hour for start_time and end_time (e.g. "09:00", "17:00"). Shifts are saved as drafts — managers publish them from the Roster page.

INSIGHTS
Insights — charts showing time tracked, tasks completed, expenses, and team productivity over time. You cannot read insights data. Tell the user to go to Insights in the sidebar.

OTHER SECTIONS (accessible from sidebar or settings)
Projects — group work into projects linked to clients. Projects have a name, colour, due date, and status (active or archived). You can read, create, and update projects. Each project also has a project expenses list — costs incurred on the job such as materials, equipment hire, or subcontractor charges. Use get_project_expenses to see what has been spent on a project and its total. When drafting a quote or invoice, always check project expenses first if you have the project ID — the user may want to include or reference those costs.
Tasks — to-do items that belong to projects, with assignee, priority (urgent/high/normal/low), due date, and status (todo/in_progress/done). You can read, create, and update tasks.
Reports — export time logs, expense reports, and leave summaries as CSV files for payroll or accounting. You cannot generate reports. Tell the user to go to Reports in the sidebar.
Team — org members with roles: owner, admin, manager, employee. Admins can invite new members from Settings. You can read team members.
Settings — account preferences, notifications, appearance (dark/light mode), invoice letterhead, org settings, and member invitations. You cannot change settings. Tell the user to go to Settings.
Billing — manage the subscription plan (personal, pro, or business). You cannot modify billing. Tell the user to go to Billing in the sidebar.`

// System prompt is 100% static so the cache prefix (system + tools) is
// identical on every request — Anthropic reuses the processed prefix for the
// 5-minute cache window instead of re-tokenising ~3500 tokens each call.
const SYSTEM_BLOCKS: Anthropic.TextBlockParam[] = [
  { type: 'text', text: SYSTEM_PROMPT_BASE, cache_control: { type: 'ephemeral' } },
]

// Mark the last tool so Anthropic also caches the full tool schema.
// The cache key for this marker is: system + all tools — all static.
const CACHED_TOOLS: Anthropic.Tool[] = TOOL_SCHEMAS.map((t, i) =>
  i === TOOL_SCHEMAS.length - 1 ? { ...t, cache_control: { type: 'ephemeral' } } : t,
)

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey || apiKey === 'replace-with-your-anthropic-api-key') {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY is not configured.' }, { status: 500 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sub = await getSubscription(user.id)
  if (!isPaidPlan(sub)) return NextResponse.json({ error: 'Upgrade to Pro to use the AI assistant.' }, { status: 403 })

  let messages: ChatMessage[]
  try {
    const body = await request.json()
    messages = Array.isArray(body.messages) ? body.messages : []
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const cleanMessages = (messages as ChatMessage[])
    .filter(m => {
      if (m.role !== 'user' && m.role !== 'assistant') return false
      if (typeof m.content === 'string') return m.content.trim().length > 0
      return Array.isArray(m.content) && m.content.length > 0
    })
    .slice(-20)
    .map(m => ({
      role: m.role as 'user' | 'assistant',
      content: typeof m.content === 'string' ? m.content.trim() : m.content,
    }))

  if (!cleanMessages.length || cleanMessages[cleanMessages.length - 1].role !== 'user') {
    return NextResponse.json({ error: 'A user message is required.' }, { status: 400 })
  }

  const anthropic = new Anthropic({ apiKey })
  const encoder = new TextEncoder()

  // Inject the current datetime as the first message pair so it appears AFTER
  // the cached system+tools prefix. The client never sends or saves these two
  // synthetic messages — they exist only for this API call.
  const messagesWithContext: Anthropic.MessageParam[] = [
    { role: 'user', content: `[Context: Current datetime (UTC) is ${new Date().toISOString()}]` },
    { role: 'assistant', content: 'Understood.' },
    ...cleanMessages.map(m => ({
      role: m.role,
      content: m.content as unknown as Anthropic.MessageParam['content'],
    })),
  ]

  const responseStream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let currentMessages: Anthropic.MessageParam[] = messagesWithContext
      const MAX_ITERATIONS = 5

      try {
        for (let i = 0; i < MAX_ITERATIONS; i++) {
          // Use streaming for every call so text reaches the client as soon as the
          // model starts generating — rather than buffering the full response first.
          const finalMessage = await anthropic.messages
            .stream({
              model: 'claude-haiku-4-5-20251001',
              max_tokens: 1024,
              system: SYSTEM_BLOCKS,
              tools: CACHED_TOOLS,
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
