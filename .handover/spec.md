# Multi-Category JSA

## Goal
Let a JSA cover multiple hazard categories in one document (e.g. ladder work + power tools),
grouped and collapsible on screen and in the generated PDF. SWMS stays single-category.

## Key decisions
- Source spec: `docs/superpowers/specs/2026-07-19-multi-category-jsa-design.md`
- Source plan: `docs/superpowers/plans/2026-07-19-multi-category-jsa.md` — one task, the exact
  code to transcribe for every file is in that plan. This checklist is the tracker; the plan file
  is the source of truth for content.
- No database migration — the existing free-text `category` column on `project_swms_documents`
  stores a comma-joined list of hazard keys for multi-category JSA (no filtering query anywhere
  reads that column, so no schema change needed).
- SWMS is entirely unaffected — single category, unchanged dropdown, unchanged licence-class
  cross-check.
- Unchecking a JSA category deletes its rows (including edits) from the form — intentional,
  flagged directly in the UI, not a bug to "fix" during implementation.
- This is one cohesive item, not several — `types/swms.ts`'s field rename (`category` →
  `categories` on the JSA branch) cascades to every other file simultaneously under TypeScript
  strict mode, so there is no way to split it into independently-buildable pieces.

## Rules for Codex
- Text edits only. Do NOT run shell commands (pnpm, git, node, Supabase MCP) — the conductor
  handles those.
- Transcribe the plan's code exactly — every step's Find/Replace (or full-file Create/Replace)
  block in `docs/superpowers/plans/2026-07-19-multi-category-jsa.md` Task 1 is complete, real
  content, across all 9 files it lists.
- If any Find block doesn't match a file's actual current content, report it as a blocker with
  the exact text searched for and what the file actually contains nearby — do not guess.

## Rules for conductor (Claude)
- `pnpm run build` after the turn — must pass before ticking the box and committing.
- No migration this phase — no conductor-only SQL item.

---

- [x] **MJ-1** — Multi-category JSA (plan Task 1, all 9 files).
  - [ ] Manual smoke (deferred to user): build a new JSA with 2 categories checked, confirm
    grouped/collapsible rows and deduplicated PPE; uncheck one and confirm only its rows go;
    generate the PDF and confirm matching grouping; open an existing single-category JSA and
    confirm it loads correctly.

## Acceptance checklist
- [x] SWMS documents are completely unaffected.
- [x] Checking multiple JSA categories merges rows (grouped) and PPE (flat, deduplicated).
- [x] Unchecking a category removes its rows only.
- [x] Generated PDF groups rows the same way the screen does.
- [x] Editing a pre-existing single-category JSA loads correctly with rows retroactively tagged.
- [x] Full `pnpm run build` passes clean.
- [ ] Manual smoke — user follow-up, not the conductor's to complete.

## Verification
No test runner in this project — verification is `pnpm run build` (tsc + eslint), plus the
manual-smoke notes above.
