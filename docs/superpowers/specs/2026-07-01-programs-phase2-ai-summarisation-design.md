# Programs Phase 2 — AI Summarisation

**Date:** 2026-07-01
**Status:** Approved for implementation

---

## What we're building

Automatically generate a short summary and a handful of tags for `note`, `image`, and `pdf`
program assets using Claude, so browsing a Program's content gives you more than just a filename.
This is the last piece of the original Programs roadmap (Phase 1's `ai_status`/`ai_summary`/
`ai_tags` columns exist specifically for this and have sat unused since).

## Out of scope

- `docx`/`xlsx` — no text-extraction library exists in this codebase; adding one is a separate
  dependency decision, not bundled into this phase.
- `audio`/`video`/`link` — no transcription or web-fetch capability exists; stays `ai_status:
  'skipped'`, same as today.
- Live UI updates while summarisation runs — no polling, no websocket. Tags/summary appear next
  time the explorer is loaded, matching the existing fire-and-forget precedent in this codebase
  (the auto-pay-run trigger).
- Editing a note re-triggering summarisation, or a manual "regenerate" action — summarise-on-
  create only.
- Custom end dates, batching, or a cron sweep — this is purely event-driven, one call per eligible
  asset at creation time.

---

## Claude integration

Reuses the existing `@anthropic-ai/sdk` client and model already used by
`src/app/api/video/notes/[callId]/summarise/route.ts` and `src/app/api/assistant/route.ts` — no
new npm dependency.

New helper module: `src/lib/programs/summarise-asset.ts`

```typescript
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
// model: 'claude-haiku-4-5-20251001', max_tokens: 1024 — same as the existing two call sites
```

One prompt shape for all three types, always asking for the same fixed template:

```
## Summary
<2-3 sentence summary>

## Tags
tag1, tag2, tag3
```

- **note**: plain text prompt built directly from `note_content`. Skipped (no API call, stays
  `ai_status: 'skipped'`) if the content is blank or under ~20 characters — nothing meaningful to
  summarise.
- **image**: downloads the file from the `program-assets` Storage bucket server-side via
  `createServiceClient()`, base64-encodes it, and sends an `image` content block —
  `{ type: 'image', source: { type: 'base64', media_type, data } }`, the exact shape already used
  by the AI assistant chat's image support.
- **pdf**: same download-and-base64 approach, sent as a `document` content block —
  `{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }`. This
  content-block type isn't used anywhere else in the codebase yet, but the installed SDK version
  (`^0.100.1`) supports it natively; no new dependency.

The response text is parsed by splitting on the `## Summary` / `## Tags` headers: everything
between them (trimmed) becomes `ai_summary`; the tags line is split on commas, trimmed, and
lowercased into `ai_tags`.

**Failure handling:** any error (storage download failure, Claude API error, unexpected response
shape) sets `ai_status: 'failed'` and stops — no retry logic. A failed asset simply shows no tags
and no summary option, same as if it had never been processed.

---

## API + trigger flow

New route: `POST /api/programs/[id]/assets/[assetId]/summarise`

- Auth: same `assertAdminAccess` check already used by the other asset routes in
  `src/app/api/programs/[id]/assets/route.ts` (program owner or org owner/admin/manager).
- Steps: fetch the asset, verify `asset_type` is `note`/`image`/`pdf` (no-op otherwise), set
  `ai_status: 'processing'`, run the Claude call from `summarise-asset.ts`, write
  `ai_summary`/`ai_tags`/`ai_status: 'done'` — or `ai_status: 'failed'` on error.

**Asset creation changes** (both branches of `POST /api/programs/[id]/assets/route.ts` — the JSON
body branch for `note`, and the multipart branch for file uploads): `ai_status` changes from the
current unconditional `'skipped'` to `'pending'` when `asset_type` is `note`, `image`, or `pdf`;
every other type keeps `'skipped'` exactly as today.

**Trigger**: `AssetUploadZone.tsx`'s three save paths (`uploadFile`, `handleSaveNote` — `link`/
`handleSaveLink` never qualifies) each fire a non-awaited `fetch` to the new summarise route
immediately after `onAssetAdded(json)` succeeds, when the created asset's type is eligible. The
browser doesn't wait for it and the modal closes normally — this mirrors the exact "client fires
a separate request, doesn't await it, server fully processes it" pattern already used for the
auto-pay-run check in `ManagerTimesheetView.tsx` (not an in-process fire-and-forget inside another
serverless function, which would risk being killed early — a genuine second HTTP request).

---

## UI

`AssetCard.tsx`: when `ai_status === 'done'` and `ai_tags.length > 0`, up to 3 small tag pills
render under the asset name (same visual weight as the existing type/size caption line).

The existing kebab (⋮) button is currently only rendered at all when `canManage` is true (its one
menu item is Delete). This needs a small restructure rather than just a new item: the kebab button
renders when `canManage OR ai_summary` is truthy; inside the menu, "Delete" only appears when
`canManage`, and "View AI summary" only appears when `ai_summary` is non-null (so a non-manager
viewer can still read a summary, just can't delete). Clicking "View AI summary" opens a small
popover with the full summary text and a close button, matching the existing kebab menu's
popover styling.

---

## Files touched

**New:**
- `src/lib/programs/summarise-asset.ts`
- `src/app/api/programs/[id]/assets/[assetId]/summarise/route.ts`

**Modified:**
- `src/app/api/programs/[id]/assets/route.ts` — `ai_status` defaults to `'pending'` for
  note/image/pdf
- `src/components/programs/AssetUploadZone.tsx` — fire-and-forget trigger after eligible uploads
- `src/components/programs/AssetCard.tsx` — tag pills + "View AI summary" kebab item and popover
