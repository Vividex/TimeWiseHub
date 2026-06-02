TimeWiseHub instructions
- Work through requested changes one step at a time, in the exact order given.
- Analyse the best approach before implementation when a task has multiple options or gameplay tradeoffs.
- Do not make code, asset, or config changes without explicit approval.
- When approval is needed, clearly write `APPROVAL REQUIRED:` so it is easy to notice.
- Touch only files necessary for the approved step.
- Prefer PowerShell commands in this workspace.
- Use `rg` / `rg --files` for searching when available.
- Use `apply_patch` for manual text edits.
- Do not install external tools or packages unless explicitly approved.
- Preserve existing gameplay unless the approved step requires changing it.
- Before platform-specific work, confirm the active target platform and required Unity modules.
- After JavaScript changes, run syntax checks with `node --check` over the scripts.
- Keep final summaries concise and include what was verified.

# Platform Planning

- Primary development target is Windows/Unity Editor.
- Android and iOS builds are planned later, so avoid Windows-only assumptions.
- Keep input systems abstracted so keyboard, controller, and touch controls can coexist.
- Design UI for scalable phone/tablet aspect ratios from the start.
- Keep performance mobile-conscious: avoid excessive particles, lighting, physics, texture sizes, and post-processing.
- Do not install Android/iOS Unity modules unless explicitly approved.
- iOS final builds require macOS/Xcode/Apple signing; treat iOS as a later build pipeline task.
- Keep build outputs outside the project folder where possible.

# Multi-AI Workflow Rules

## Platform Assessment
Before beginning a task, briefly assess whether Codex or Claude is better suited.

- Codex is preferred for:
  - targeted implementation
  - debugging
  - small patches
  - terminal-driven fixes
  - syntax correction

- Claude is preferred for:
  - architecture review
  - regression analysis
  - large-file understanding
  - gameplay/system planning
  - identifying root causes

If the other platform is better suited, say so before editing.

---

## HANDOVER.md
Before starting work:
- Read GOALS.md to review current progress and priorities.
- Read HANDOVER.md if present.
- Check git status.

After completing work:
- Update HANDOVER.md with:
  - files inspected
  - files changed
  - summary of findings
  - tests performed
  - risk level
  - next recommended action

---

## Key Insights Rule
After investigations or edits, provide a concise "Key Insights" section including:
- what files were searched
- what files were modified
- important findings
- current risks
- what was intentionally NOT changed

---

## No Silent Editing
Before making changes, explicitly state:
"I am about to modify: [files]"

After changes, explicitly state:
"I modified: [files]"

If no files were changed, explicitly say so.

---

## Git Awareness
Before edits:
- run git status

After edits:
- run git status
- summarize changed files

## Git Commit Reminders
Prompt the user to commit after any of the following:
- A phase or sub-phase in GOALS.md is marked complete
- A new script, prefab, or scene is created and verified working
- A bug is fixed and confirmed resolved
- HANDOVER.md is updated at the end of a session
- Any config or package change that leaves the project in a clean, stable state

When recommending a commit, say:
> "Recommend committing now — [one-line reason]."

---

## Multi-AI Safety
Only one AI should modify files at a time.

The other AI should remain in:
- review
- planning
- analysis
- or testing support mode.

Avoid simultaneous edits to the same files.
