# Client Edit — Design Spec
_Date: 2026-06-30_

## Problem

The client detail page (`/dashboard/clients/[id]`) displays name, email, phone, and address but provides no way to update those values or the default rate / currency. The only mutation available is archive/delete.

## Scope

Edit the six existing client fields via a modal on the detail page. No new fields, no schema changes.

Fields: `name` (required), `email`, `phone`, `address`, `default_rate`, `currency`.

---

## Architecture

### API — extend `/api/clients/[id]` PATCH

The existing PATCH handler only handles `{ archived: boolean }`. We extend it to also handle field edits when the body contains `name`.

**Request body shapes:**
- Archive toggle (existing): `{ archived: boolean }`
- Field edit (new): `{ name, email?, phone?, address?, default_rate?, currency? }`

**Auth — fix a latent bug:** The current `requireAdmin` helper checks org membership role (`owner` | `admin`). This correctly gates org-level clients. But a solo freelancer who created a client has `clients.owner_id = user.id` with no org membership — `requireAdmin` returns `false` for them, meaning they can't archive or edit their own clients via the API. Fix: before calling `requireAdmin`, check if the requesting user is the `owner_id` of this specific client record. If yes, allow the operation.

Auth logic for the edit path:
1. Fetch the client row to confirm it exists and get `owner_id`.
2. Allow if `client.owner_id === user.id` OR `requireAdmin(supabase, user.id)` is true.
3. Otherwise 403.

### New components

**`src/components/clients/EditClientButton.tsx`** (client component)
- Receives the full client object as props: `{ id, name, email, phone, address, default_rate, currency }`.
- Manages `isOpen` boolean state.
- Renders an "Edit" button; when clicked, renders `<EditClientModal>`.

**`src/components/clients/EditClientModal.tsx`** (client component)
- Props: `client` (same shape as above), `onClose: () => void`.
- Form pre-populated with current values.
- On submit: `PATCH /api/clients/[id]` with updated fields.
- On success: calls `onClose()` then `router.refresh()` to reload server data.
- On error: shows inline error message.
- Fields and styling match `ClientForm.tsx` exactly (same input classes, same currency list).

### Detail page — `src/app/dashboard/clients/[id]/page.tsx`

Changes:
1. Extend the client select to include `default_rate` and `currency` (currently only fetches `id, name, email, phone, address`).
2. Compute `canEdit`: true if `isAdmin` OR `client.owner_id === user.id`. Requires adding `owner_id` to the select.
3. Render `<EditClientButton>` conditionally on `canEdit`, placed in the header action area to the left of `<DeleteClientButton>` (which remains gated on `isAdmin`).

---

## Auth summary

| User type | Can edit? |
|---|---|
| Solo freelancer (owner of client, no org) | Yes — `owner_id` check |
| Org admin/owner | Yes — `requireAdmin` check |
| Org member (non-admin) | No |
| Unrelated user | No (RLS also blocks at DB level) |

---

## Error handling

- Required `name` field: validated client-side (`required` attribute) and server-side (return 400 if missing).
- Network/DB errors: displayed inline in the modal below the form.
- Optimistic updates: not used — `router.refresh()` after success is sufficient.

---

## Out of scope

- No new DB migration needed (no schema changes).
- No edit from the clients list page.
- No audit log changes (the existing `trg_activity_clients` trigger fires on any UPDATE, so edits are already logged).
