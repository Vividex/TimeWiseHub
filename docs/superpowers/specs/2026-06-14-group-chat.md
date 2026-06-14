# Group Chat — Design Spec

**Date:** 14 June 2026
**Status:** Approved for implementation

---

## Goal

Allow any organisation member to create named, private group conversations with selected colleagues. Fills the gap between announcement-style channels (manager → team) and 1:1 DMs — enabling ad-hoc project-team side conversations.

---

## Scope

Text messaging only. No video, no audio. Membership is dynamic (add/remove after creation). Any member can create a group.

---

## Data model

### Type extension
`type` is a native Postgres enum `chat_conversation_type`. Add the new value:

```sql
ALTER TYPE chat_conversation_type ADD VALUE 'group';
```

### Existing columns used as-is
| Column | Used for groups as |
|--------|-------------------|
| `title` | Group display name (required, non-null for groups) |
| `type` | `'group'` |
| `dm_key` | `null` (only used for DMs) |
| `org_id` | Unchanged |
| `created_by` | Group creator uuid — used for remove-member permission |

### Membership
Existing `chat_participants` table (`conversation_id`, `user_id`, `last_read_at`) handles membership — no new tables or columns needed.

### RLS
Group conversations must only be visible to their members. The existing DM policy pattern (`user must be in conversation_members`) applies unchanged to groups.

---

## TypeScript types

`src/lib/chat/types.ts`:
- `ChatConversationType`: extend to `'channel' | 'dm' | 'group'`
- No other type changes needed

---

## Feature: Creating a group

**Entry point:** "New Group" button in the `ConversationList` header, alongside the existing "New DM" button.

**Dialog (`NewGroupDialog`):** Modelled on `NewDmDialog`. Single screen with:
1. **Group name** — text input, required
2. **Member selector** — org member list, multi-select (checkboxes), excludes self
3. **Create button** — disabled until name is non-empty and ≥1 member selected

**On submit:**
1. Insert row into `chat_conversations` (`type: 'group'`, `title`, `org_id`, `created_by: current user`)
2. Insert current user + all selected members into `chat_participants`
3. Close dialog, open the new group thread automatically

---

## Feature: Sidebar display

Groups appear in `ConversationList` under a **"Groups"** heading, positioned between Channels and DMs.

Each row:
- Group icon (lucide `Users` — distinct from the single-avatar DM rows)
- Group name
- Unread badge (same logic as channels/DMs)

The thread view (`MessageThread`) is unchanged — groups use it as-is.

---

## Feature: Member management

A settings icon (`Settings` or `Users`) in the group thread header toggles an inline panel.

**Panel contents:**

| Element | Behaviour |
|---------|-----------|
| Rename group | Text input + save; any member may rename |
| Member list | Name + avatar for each member; × button to remove |
| Remove member | Group creator only may remove others |
| Add members | Multi-select org members not already in group; any member may add |
| Leave group | Removes current user from `conversation_members`; available to all members |

**Edge case — creator leaves:**
If the creator leaves, the group persists. Remove-member permission for that group is effectively lost (no new owner assignment needed — keep it simple for v1).

**Edge case — last member leaves:**
Group conversation remains in the DB but disappears from all sidebars. No auto-deletion needed for v1.

---

## Files to create / modify

| File | Change |
|------|--------|
| `supabase/schema-051-group-chat.sql` | `ALTER TYPE chat_conversation_type ADD VALUE 'group'` |
| `src/lib/chat/types.ts` | Extend `ChatConversationType` |
| `src/components/chat/ConversationList.tsx` | Add Groups section, "New Group" button |
| `src/components/chat/NewGroupDialog.tsx` | New component — create group dialog |
| `src/components/chat/GroupSettingsPanel.tsx` | New component — rename/add/remove/leave |
| `src/components/chat/ChatClient.tsx` | Wire in NewGroupDialog and GroupSettingsPanel |
| `src/components/chat/MessageThread.tsx` | Add settings icon in header for group threads |

---

## Out of scope (v1)

- Group avatars / cover images
- Admin override to remove members (creator-only is sufficient for v1)
- Auto-owner transfer when creator leaves
- Group chat notifications beyond the existing unread badge + push system (existing system covers it)
- Archiving or deleting groups
