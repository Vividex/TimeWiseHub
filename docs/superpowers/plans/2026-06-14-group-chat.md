# Group Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add named group conversations (multi-member, dynamic membership) as a third chat type alongside existing channels and DMs.

**Architecture:** Extend the `chat_conversation_type` Postgres enum with `'group'`, add a `SECURITY DEFINER` RPC `create_group_chat` (mirrors `start_dm` pattern), add RLS policies for add/remove/rename, then build three components: `NewGroupDialog`, `GroupSettingsPanel`, and update `ConversationList` and `ChatClient` to wire everything together.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Tailwind v4, Supabase (`@supabase/ssr`). No new dependencies.

---

## File map

| File | Action | Purpose |
|------|--------|---------|
| `supabase/schema-054-group-chat.sql` | Create | Enum extension, RPC, RLS policies |
| `src/lib/chat/types.ts` | Modify | Add `'group'` to type; add `created_by` to `ChatConversation` |
| `src/components/chat/ChatRealtimeProvider.tsx` | Modify | Expose `orgId` on context; select `created_by` in query |
| `src/components/chat/NewGroupDialog.tsx` | Create | Dialog: group name + multi-select members |
| `src/components/chat/ConversationList.tsx` | Modify | Groups section + `onNewGroup` prop |
| `src/components/chat/GroupSettingsPanel.tsx` | Create | Rename, add/remove members, leave group |
| `src/components/chat/ChatClient.tsx` | Modify | Wire dialogs, settings panel, title/canPost logic |

---

## Task 1: DB Migration

**Files:**
- Create: `supabase/schema-054-group-chat.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- Schema 054: Group chat conversations
-- Extends chat_conversation_type enum, adds create_group_chat RPC,
-- and adds RLS policies for group member management.

-- ── 1. Extend enum ───────────────────────────────────────────────
ALTER TYPE public.chat_conversation_type ADD VALUE IF NOT EXISTS 'group';

-- ── 2. Update can_post_chat to allow group members to post ───────
-- (channels still require management role; dm and group allow any participant)
CREATE OR REPLACE FUNCTION public.can_post_chat(p_conversation uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public AS $$
DECLARE
  v_type public.chat_conversation_type;
  v_org  uuid;
BEGIN
  SELECT type, org_id INTO v_type, v_org
  FROM public.chat_conversations WHERE id = p_conversation;
  IF v_type IS NULL THEN RETURN false; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.chat_participants
    WHERE conversation_id = p_conversation AND user_id = auth.uid()
  ) THEN
    RETURN false;
  END IF;
  -- dm and group: any participant can post
  IF v_type IN ('dm', 'group') THEN
    RETURN true;
  END IF;
  -- channel: management only
  RETURN EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.org_id = v_org AND om.user_id = auth.uid()
      AND om.role IN ('owner', 'admin', 'manager')
  );
END;
$$;

-- ── 3. create_group_chat RPC (SECURITY DEFINER — bypasses INSERT RLS) ──
CREATE OR REPLACE FUNCTION public.create_group_chat(
  p_title     text,
  p_member_ids uuid[]
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me  uuid := auth.uid();
  v_org uuid;
  v_id  uuid;
  v_uid uuid;
BEGIN
  IF p_title IS NULL OR trim(p_title) = '' THEN
    RAISE EXCEPTION 'group name required';
  END IF;

  SELECT org_id INTO v_org
  FROM public.organisation_members
  WHERE user_id = v_me
  LIMIT 1;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'not a member of any organisation';
  END IF;

  INSERT INTO public.chat_conversations (org_id, type, title, created_by)
  VALUES (v_org, 'group', trim(p_title), v_me)
  RETURNING id INTO v_id;

  -- Add creator
  INSERT INTO public.chat_participants (conversation_id, user_id)
  VALUES (v_id, v_me);

  -- Add selected members (skip self and non-org members)
  FOREACH v_uid IN ARRAY p_member_ids LOOP
    IF v_uid <> v_me AND EXISTS (
      SELECT 1 FROM public.organisation_members
      WHERE org_id = v_org AND user_id = v_uid
    ) THEN
      INSERT INTO public.chat_participants (conversation_id, user_id)
      VALUES (v_id, v_uid)
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_group_chat(text, uuid[]) TO authenticated;

-- ── 4. RLS: group members can add others ─────────────────────────
CREATE POLICY "Group members can add others"
  ON public.chat_participants FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.chat_conversations c
      WHERE c.id = chat_participants.conversation_id
        AND c.type = 'group'
        AND public.is_chat_participant(chat_participants.conversation_id)
    )
  );

-- ── 5. RLS: leave group or creator removes member ─────────────────
CREATE POLICY "Leave or remove from group"
  ON public.chat_participants FOR DELETE
  USING (
    -- self: leave a group you belong to
    (
      user_id = auth.uid()
      AND EXISTS (
        SELECT 1 FROM public.chat_conversations c
        WHERE c.id = chat_participants.conversation_id AND c.type = 'group'
      )
    )
    OR
    -- group creator: remove others from their group
    EXISTS (
      SELECT 1 FROM public.chat_conversations c
      WHERE c.id = chat_participants.conversation_id
        AND c.type = 'group'
        AND c.created_by = auth.uid()
    )
  );

-- ── 6. RLS: group members can rename the group ────────────────────
CREATE POLICY "Group members can rename"
  ON public.chat_conversations FOR UPDATE
  USING (type = 'group' AND public.is_chat_participant(id))
  WITH CHECK (type = 'group' AND public.is_chat_participant(id));
```

- [ ] **Step 2: [CONDUCTOR] Apply migration via Supabase MCP**

```
mcp__supabase__apply_migration
  project_id: sdwwlnnsijcadkdwsvud
  name: group_chat
  query: <contents of schema-054-group-chat.sql>
```

- [ ] **Step 3: [CONDUCTOR] Commit**

```bash
git add supabase/schema-054-group-chat.sql
git commit -m "C1-1..C1-2 add group chat migration — enum, RPC, RLS policies"
```

---

## Task 2: TypeScript Types + Context

**Files:**
- Modify: `src/lib/chat/types.ts`
- Modify: `src/components/chat/ChatRealtimeProvider.tsx`

- [ ] **Step 1: Extend `ChatConversationType` and `ChatConversation`**

Replace the first 10 lines of `src/lib/chat/types.ts` with:

```ts
export type ChatConversationType = 'channel' | 'dm' | 'group'

export type ChatConversation = {
  id: string
  org_id: string
  type: ChatConversationType
  title: string | null
  dm_key: string | null
  created_by: string | null
  created_at: string
}
```

- [ ] **Step 2: Add `orgId` to context and select `created_by`**

In `src/components/chat/ChatRealtimeProvider.tsx`:

**a) Add `orgId: string` to `ChatContextValue` type** (after `userId: string`):

```ts
type ChatContextValue = {
  userId: string
  orgId: string
  loading: boolean
  conversations: ChatConversation[]
  members: Record<string, ChatMember>
  unreadByConversation: Record<string, number>
  unreadTotal: number
  activeConversationId: string | null
  lastInsert: LiveInsert | null
  setActiveConversation: (id: string | null) => void
  markRead: (id: string) => Promise<void>
  refreshConversations: () => Promise<void>
}
```

**b) Add `created_by` to the `loadConversations` select string** (line 93):

```ts
.select('id, org_id, type, title, dm_key, created_by, created_at')
```

**c) Add `orgId` to the value object** (in the `value` constant near line 202):

```ts
const value: ChatContextValue = {
  userId,
  orgId,
  loading,
  conversations,
  members,
  unreadByConversation: unread,
  unreadTotal,
  activeConversationId,
  lastInsert,
  setActiveConversation,
  markRead,
  refreshConversations: loadConversations,
}
```

- [ ] **Step 3: [CONDUCTOR] Build check**

```
pnpm run build
```

Expected: compiles clean (tsc + eslint pass, zero errors).

- [ ] **Step 4: [CONDUCTOR] Commit**

```bash
git add src/lib/chat/types.ts src/components/chat/ChatRealtimeProvider.tsx
git commit -m "C2-1..C2-2 extend ChatConversationType with group, expose orgId on context"
```

---

## Task 3: NewGroupDialog Component

**Files:**
- Create: `src/components/chat/NewGroupDialog.tsx`

- [ ] **Step 1: Create the component**

```tsx
'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { createClient } from '@/lib/supabase-browser'
import { useChat } from '@/components/chat/ChatRealtimeProvider'
import { displayName } from '@/lib/chat/types'
import UserAvatar from '@/components/UserAvatar'

export default function NewGroupDialog({
  onClose,
  onStarted,
}: {
  onClose: () => void
  onStarted: (conversationId: string) => void
}) {
  const { userId, members, refreshConversations } = useChat()
  const [groupName, setGroupName] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const supabase = createClient()

  const others = Object.values(members).filter(m => m.user_id !== userId)

  function toggleMember(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function createGroup() {
    if (busy || !groupName.trim() || selectedIds.size === 0) return
    setBusy(true)
    const { data, error } = await supabase.rpc('create_group_chat', {
      p_title: groupName.trim(),
      p_member_ids: Array.from(selectedIds),
    })
    if (error || !data) {
      alert(error?.message ?? 'Failed to create group')
      setBusy(false)
      return
    }
    await refreshConversations()
    onStarted(data as string)
    onClose()
  }

  const canCreate = groupName.trim().length > 0 && selectedIds.size > 0 && !busy

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-900">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">New group</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-slate-700 dark:hover:text-slate-200">
            <X size={18} />
          </button>
        </div>
        <input
          type="text"
          placeholder="Group name"
          value={groupName}
          onChange={e => setGroupName(e.target.value)}
          className="mb-4 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-slate-900 placeholder:text-gray-400 focus:border-cyan-400 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        />
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Add members</p>
        <div className="max-h-64 space-y-1 overflow-y-auto">
          {others.length === 0 && (
            <p className="text-sm font-medium text-gray-400">No other members in your organisation yet.</p>
          )}
          {others.map(m => {
            const selected = selectedIds.has(m.user_id)
            return (
              <button
                key={m.user_id}
                onClick={() => toggleMember(m.user_id)}
                disabled={busy}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors disabled:opacity-50 ${
                  selected ? 'bg-cyan-50 dark:bg-slate-700' : 'hover:bg-gray-50 dark:hover:bg-slate-800'
                }`}
              >
                <UserAvatar avatarUrl={m.avatar_url} name={displayName(m)} size={36} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {displayName(m)}
                  </span>
                  <span className="block truncate text-xs font-medium capitalize text-gray-400">{m.role}</span>
                </span>
                {selected && (
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-cyan-500">
                    <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 10 10">
                      <path d="M2 5l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                )}
              </button>
            )
          })}
        </div>
        <button
          onClick={createGroup}
          disabled={!canCreate}
          className="mt-4 w-full rounded-xl bg-cyan-500 py-2 text-sm font-bold text-white transition-colors hover:bg-cyan-600 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? 'Creating…' : 'Create group'}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: [CONDUCTOR] Commit**

```bash
git add src/components/chat/NewGroupDialog.tsx
git commit -m "C3-1 add NewGroupDialog component"
```

---

## Task 4: Update ConversationList

**Files:**
- Modify: `src/components/chat/ConversationList.tsx`

- [ ] **Step 1: Replace entire file**

```tsx
'use client'

import { Megaphone, Plus, Users } from 'lucide-react'
import { useChat } from '@/components/chat/ChatRealtimeProvider'
import { displayName } from '@/lib/chat/types'
import type { ChatConversation } from '@/lib/chat/types'
import UserAvatar from '@/components/UserAvatar'

function dmPeerId(conv: ChatConversation, userId: string): string | null {
  if (conv.type !== 'dm' || !conv.dm_key) return null
  const [a, b] = conv.dm_key.split(':')
  return a === userId ? b : a
}

export default function ConversationList({
  onNewDm,
  onNewGroup,
}: {
  onNewDm: () => void
  onNewGroup: () => void
}) {
  const { userId, conversations, members, unreadByConversation, activeConversationId, setActiveConversation } = useChat()

  const channels = conversations.filter(c => c.type === 'channel')
  const groups = conversations.filter(c => c.type === 'group')
  const dms = conversations.filter(c => c.type === 'dm')

  function label(conv: ChatConversation): string {
    if (conv.type === 'channel') return conv.title ?? 'Announcements'
    if (conv.type === 'group') return conv.title ?? 'Group chat'
    const peer = dmPeerId(conv, userId)
    const m = peer ? members[peer] : null
    return m ? displayName(m) : 'Direct message'
  }

  function row(conv: ChatConversation) {
    const unread = unreadByConversation[conv.id] ?? 0
    const active = conv.id === activeConversationId
    return (
      <button
        key={conv.id}
        onClick={() => setActiveConversation(conv.id)}
        className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
          active ? 'bg-cyan-50 dark:bg-slate-800' : 'hover:bg-gray-50 dark:hover:bg-slate-800/60'
        }`}
      >
        {conv.type === 'channel' ? (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-950">
            <Megaphone size={16} />
          </span>
        ) : conv.type === 'group' ? (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-600 dark:bg-violet-950">
            <Users size={16} />
          </span>
        ) : (
          (() => {
            const peer = dmPeerId(conv, userId)
            const m = peer ? members[peer] : null
            return <UserAvatar avatarUrl={m?.avatar_url} name={label(conv)} size={36} />
          })()
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{label(conv)}</span>
        </span>
        {unread > 0 && (
          <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-cyan-500 px-1.5 text-xs font-bold text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
    )
  }

  return (
    <div className="flex h-full w-72 shrink-0 flex-col border-r border-gray-200 dark:border-slate-800">
      <div className="px-4 py-4">
        <h2 className="text-sm font-black uppercase tracking-wide text-slate-500">Messages</h2>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {channels.length > 0 && (
          <div className="mb-1">
            <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-gray-400">Channels</p>
            <div className="space-y-0.5">{channels.map(row)}</div>
          </div>
        )}

        <div className="mb-1 mt-3">
          <div className="flex items-center justify-between px-3 pb-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Groups</p>
            <button
              onClick={onNewGroup}
              className="text-gray-400 transition-colors hover:text-cyan-500"
              title="New group"
            >
              <Plus size={13} />
            </button>
          </div>
          {groups.length === 0 ? (
            <p className="px-3 py-1 text-xs text-gray-300 dark:text-slate-600">No groups yet.</p>
          ) : (
            <div className="space-y-0.5">{groups.map(row)}</div>
          )}
        </div>

        <div className="mt-3">
          <div className="flex items-center justify-between px-3 pb-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Direct messages</p>
            <button
              onClick={onNewDm}
              className="text-gray-400 transition-colors hover:text-cyan-500"
              title="New message"
            >
              <Plus size={13} />
            </button>
          </div>
          {dms.length === 0 ? (
            <p className="px-3 py-1 text-xs text-gray-300 dark:text-slate-600">No messages yet.</p>
          ) : (
            <div className="space-y-0.5">{dms.map(row)}</div>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: [CONDUCTOR] Commit**

```bash
git add src/components/chat/ConversationList.tsx
git commit -m "C4-1 update ConversationList: groups section, onNewGroup prop"
```

---

## Task 5: GroupSettingsPanel Component

**Files:**
- Create: `src/components/chat/GroupSettingsPanel.tsx`

- [ ] **Step 1: Create the component**

```tsx
'use client'

import { useEffect, useMemo, useState } from 'react'
import { LogOut, UserPlus, X } from 'lucide-react'
import { createClient } from '@/lib/supabase-browser'
import { useChat } from '@/components/chat/ChatRealtimeProvider'
import { displayName } from '@/lib/chat/types'
import UserAvatar from '@/components/UserAvatar'

export default function GroupSettingsPanel({
  conversationId,
  groupTitle,
  createdBy,
  onClose,
  onLeft,
}: {
  conversationId: string
  groupTitle: string
  createdBy: string | null
  onClose: () => void
  onLeft: () => void
}) {
  const { userId, members, refreshConversations } = useChat()
  const [participantIds, setParticipantIds] = useState<string[]>([])
  const [title, setTitle] = useState(groupTitle)
  const [showAdd, setShowAdd] = useState(false)
  const [busy, setBusy] = useState(false)
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => { setTitle(groupTitle) }, [groupTitle])

  useEffect(() => {
    supabase
      .from('chat_participants')
      .select('user_id')
      .eq('conversation_id', conversationId)
      .then(({ data }) => {
        setParticipantIds((data ?? []).map(r => (r as { user_id: string }).user_id))
      })
  }, [conversationId, supabase])

  const isCreator = userId === createdBy
  const participantMembers = participantIds
    .map(id => members[id])
    .filter((m): m is NonNullable<typeof m> => Boolean(m))
  const nonParticipants = Object.values(members).filter(m => !participantIds.includes(m.user_id))

  async function renameGroup() {
    if (!title.trim() || title.trim() === groupTitle || busy) return
    setBusy(true)
    await supabase.from('chat_conversations').update({ title: title.trim() }).eq('id', conversationId)
    await refreshConversations()
    setBusy(false)
  }

  async function addMember(targetId: string) {
    setBusy(true)
    const { error } = await supabase.from('chat_participants').insert({
      conversation_id: conversationId,
      user_id: targetId,
      last_read_at: new Date().toISOString(),
    })
    if (!error) setParticipantIds(prev => [...prev, targetId])
    setBusy(false)
  }

  async function removeMember(targetId: string) {
    setBusy(true)
    const { error } = await supabase
      .from('chat_participants')
      .delete()
      .eq('conversation_id', conversationId)
      .eq('user_id', targetId)
    if (!error) setParticipantIds(prev => prev.filter(id => id !== targetId))
    setBusy(false)
  }

  async function leaveGroup() {
    if (!confirm('Leave this group? You will no longer see messages here.')) return
    setBusy(true)
    await supabase
      .from('chat_participants')
      .delete()
      .eq('conversation_id', conversationId)
      .eq('user_id', userId)
    await refreshConversations()
    onLeft()
  }

  return (
    <div className="flex w-72 shrink-0 flex-col border-l border-gray-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-slate-800">
        <h3 className="text-sm font-black text-slate-900 dark:text-slate-100">Group settings</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-slate-700 dark:hover:text-slate-200">
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-4">
        <div>
          <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-gray-400">
            Group name
          </label>
          <div className="flex gap-2">
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && renameGroup()}
              className="flex-1 rounded-xl border border-gray-200 px-3 py-1.5 text-sm font-medium text-slate-900 focus:border-cyan-400 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
            <button
              onClick={renameGroup}
              disabled={busy || title.trim() === groupTitle || !title.trim()}
              className="rounded-xl bg-cyan-500 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-cyan-600 disabled:opacity-40"
            >
              Save
            </button>
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wide text-gray-400">
              Members ({participantIds.length})
            </span>
            <button
              onClick={() => setShowAdd(v => !v)}
              className="flex items-center gap-1 text-xs font-bold text-cyan-500 hover:text-cyan-600"
            >
              <UserPlus size={12} /> Add
            </button>
          </div>

          {showAdd && (
            <div className="mb-3 rounded-xl border border-gray-100 p-2 dark:border-slate-700">
              {nonParticipants.length === 0 ? (
                <p className="px-2 py-1 text-xs text-gray-400">All members are already in this group.</p>
              ) : nonParticipants.map(m => (
                <button
                  key={m.user_id}
                  onClick={() => addMember(m.user_id)}
                  disabled={busy}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-gray-50 disabled:opacity-50 dark:hover:bg-slate-800"
                >
                  <UserAvatar avatarUrl={m.avatar_url} name={displayName(m)} size={24} />
                  <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">{displayName(m)}</span>
                </button>
              ))}
            </div>
          )}

          <div className="space-y-0.5">
            {participantMembers.map(m => (
              <div key={m.user_id} className="flex items-center gap-2 rounded-xl px-2 py-1.5">
                <UserAvatar avatarUrl={m.avatar_url} name={displayName(m)} size={28} />
                <span className="flex-1 truncate text-xs font-semibold text-slate-900 dark:text-slate-100">
                  {displayName(m)}
                  {m.user_id === createdBy && (
                    <span className="ml-1 font-normal text-gray-400">creator</span>
                  )}
                </span>
                {m.user_id !== userId && isCreator && (
                  <button
                    onClick={() => removeMember(m.user_id)}
                    disabled={busy}
                    className="text-gray-300 transition-colors hover:text-red-400 disabled:opacity-40"
                    title={`Remove ${displayName(m)}`}
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="border-t border-gray-100 p-4 dark:border-slate-800">
        <button
          onClick={leaveGroup}
          disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 py-2 text-sm font-bold text-red-500 transition-colors hover:bg-red-50 disabled:opacity-40 dark:border-red-900 dark:hover:bg-red-950"
        >
          <LogOut size={14} /> Leave group
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: [CONDUCTOR] Commit**

```bash
git add src/components/chat/GroupSettingsPanel.tsx
git commit -m "C5-1 add GroupSettingsPanel component"
```

---

## Task 6: Wire Everything into ChatClient

**Files:**
- Modify: `src/components/chat/ChatClient.tsx`

- [ ] **Step 1: Replace entire file**

```tsx
'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { ArrowLeft, MessageSquare, Settings } from 'lucide-react'
import { useChat } from '@/components/chat/ChatRealtimeProvider'
import ConversationList from '@/components/chat/ConversationList'
import MessageThread from '@/components/chat/MessageThread'
import MessageComposer from '@/components/chat/MessageComposer'
import NewDmDialog from '@/components/chat/NewDmDialog'
import NewGroupDialog from '@/components/chat/NewGroupDialog'
import GroupSettingsPanel from '@/components/chat/GroupSettingsPanel'
import PushPermission from '@/components/PushPermission'
import type { ChatConversation } from '@/lib/chat/types'

function dmPeerId(conv: ChatConversation, userId: string): string | null {
  if (conv.type !== 'dm' || !conv.dm_key) return null
  const [a, b] = conv.dm_key.split(':')
  return a === userId ? b : a
}

function canModerate(role: string | undefined): boolean {
  return role === 'owner' || role === 'admin' || role === 'manager'
}

export default function ChatClient() {
  const { userId, conversations, members, activeConversationId, setActiveConversation, loading } = useChat()
  const [showNewDm, setShowNewDm] = useState(false)
  const [showNewGroup, setShowNewGroup] = useState(false)
  const [showGroupSettings, setShowGroupSettings] = useState(false)
  const searchParams = useSearchParams()

  useEffect(() => {
    const c = searchParams.get('c')
    if (c) setActiveConversation(c)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, conversations.length])

  useEffect(() => {
    if (!loading && !activeConversationId && conversations.length > 0) {
      setActiveConversation(conversations[0].id)
    }
  }, [loading, activeConversationId, conversations, setActiveConversation])

  // Close settings panel when switching conversations
  useEffect(() => {
    setShowGroupSettings(false)
  }, [activeConversationId])

  const active = conversations.find(c => c.id === activeConversationId) ?? null
  const isChannel = active?.type === 'channel'
  const isGroup = active?.type === 'group'
  const peerId = active ? dmPeerId(active, userId) : null
  const peer = peerId ? members[peerId] : null
  const canPost = active ? (isChannel ? canModerate(members[userId]?.role) : true) : false

  const title = !active
    ? ''
    : isChannel
      ? (active.title ?? 'Announcements')
      : isGroup
        ? (active.title ?? 'Group chat')
        : (peer?.full_name || peer?.email || 'Direct message')

  return (
    <div className="flex h-[calc(100vh-8.5rem)] overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-slate-800 dark:bg-slate-900 lg:h-[calc(100vh-7rem)]">

      {/* Sidebar */}
      <div className={`${active ? 'hidden md:flex' : 'flex'} flex-col`}>
        <ConversationList
          onNewDm={() => setShowNewDm(true)}
          onNewGroup={() => setShowNewGroup(true)}
        />
        <div className="border-t border-gray-100 p-3 dark:border-slate-800">
          <PushPermission />
        </div>
      </div>

      {/* Thread panel */}
      <div className={`min-w-0 flex-1 ${active ? 'flex' : 'hidden md:flex'}`}>
        <div className="flex min-w-0 flex-1 flex-col">
          {active ? (
            <>
              <div className="flex items-center gap-3 border-b border-gray-200 px-4 py-3 dark:border-slate-800">
                <button
                  onClick={() => setActiveConversation(null)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 dark:hover:bg-slate-800 md:hidden"
                  aria-label="Back to conversations"
                >
                  <ArrowLeft size={18} />
                </button>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-black text-slate-900 dark:text-slate-100">{title}</h3>
                  {isChannel && (
                    <p className="text-xs font-medium text-gray-400">Org-wide · managers can post</p>
                  )}
                </div>
                {isGroup && (
                  <button
                    onClick={() => setShowGroupSettings(v => !v)}
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
                      showGroupSettings
                        ? 'bg-cyan-50 text-cyan-500 dark:bg-slate-700'
                        : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800'
                    }`}
                    title="Group settings"
                  >
                    <Settings size={16} />
                  </button>
                )}
              </div>
              <MessageThread conversationId={active.id} isChannel={isChannel} />
              <MessageComposer
                conversationId={active.id}
                canPost={canPost}
                userId={userId}
                peerUserId={peerId ?? undefined}
                peerName={peer?.full_name || peer?.email || undefined}
              />
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center text-gray-400">
              <MessageSquare size={40} className="mb-3" />
              <p className="text-sm font-medium">
                {loading ? 'Loading…' : 'Select a conversation to start chatting.'}
              </p>
            </div>
          )}
        </div>

        {showGroupSettings && active?.type === 'group' && (
          <GroupSettingsPanel
            conversationId={active.id}
            groupTitle={active.title ?? ''}
            createdBy={active.created_by}
            onClose={() => setShowGroupSettings(false)}
            onLeft={() => { setShowGroupSettings(false); setActiveConversation(null) }}
          />
        )}
      </div>

      {showNewDm && (
        <NewDmDialog onClose={() => setShowNewDm(false)} onStarted={id => setActiveConversation(id)} />
      )}
      {showNewGroup && (
        <NewGroupDialog onClose={() => setShowNewGroup(false)} onStarted={id => setActiveConversation(id)} />
      )}
    </div>
  )
}
```

- [ ] **Step 2: [CONDUCTOR] Build gate**

```
pnpm run build
```

Expected: compiles clean with zero errors.

- [ ] **Step 3: [CONDUCTOR] Commit**

```bash
git add src/components/chat/ChatClient.tsx
git commit -m "C6-1..C6-2 wire NewGroupDialog and GroupSettingsPanel into ChatClient"
```

---

## Task 7: Final Verification

- [ ] **Step 1: [CONDUCTOR] `pnpm run build` — must pass clean**

- [ ] **Step 2: [CONDUCTOR] Manual smoke**

Start dev server (`pnpm dev`) and verify:

1. **Sidebar** — Groups section appears between Channels and DMs, with a `+` button. "No groups yet." shown when empty.
2. **Create group** — Click `+` next to Groups. Dialog opens with name field + member checkboxes. Selecting members highlights them with cyan tick. Create button disabled until name + at least one member selected. After creation, group appears in sidebar and opens automatically.
3. **Group thread** — Messages send and receive. Settings gear appears in thread header (not shown for channels/DMs).
4. **Group settings** — Click gear. Panel slides in on the right. Group name is editable. Members list shows. Add button reveals non-members. × button (creator only) removes members. Leave group button works.
5. **Leave group** — After leaving, conversation disappears from sidebar (RLS removes it on next `refreshConversations`). If the settings panel is open, it closes and conversation deselects.
6. **DMs still work** — Existing DM and channel functionality unchanged.
