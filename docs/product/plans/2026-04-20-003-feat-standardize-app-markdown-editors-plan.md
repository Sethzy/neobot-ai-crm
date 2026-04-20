---
title: Standardize app-surface markdown editors
type: feat
status: active
date: 2026-04-20
---

# Standardize app-surface markdown editors

## Overview

Standardize the current app-surface markdown editing experience around one shared plain-text component. Scope is intentionally narrow: only the shipped dashboard fields that behave like markdown-backed settings/forms, not chat composition, CRM inline notes, or a future rich document editor.

Today that means exactly two surfaces:

- `src/components/automations/automation-instructions.tsx`
- `src/components/settings/agent-context-form.tsx`

The chosen direction is the boring one: a shared markdown textarea with one visual language and one input contract. This follows the `Multica` principle of one editing model per product surface, without adopting its rich editor stack before Sunder actually has a document-authoring surface that needs it.

## Problem Statement / Motivation

The app had drifted into mixed implementations for markdown-ish fields:

- Agent context used the shared textarea primitive.
- Automation instructions had diverged into a separate editor path and then a custom textarea fallback.

That inconsistency creates three problems:

1. The UI feels uneven across settings-style editors.
2. Browser input behavior can diverge subtly across surfaces.
3. Future changes are harder to make because there is no single component contract to harden with tests.

For the current product shape, a rich editor is unnecessary. These fields are durable instructions/settings, not collaborative docs. KISS and YAGNI both point to one shared plain-text markdown field.

## Proposed Solution

### Component standard

Use one shared component, `src/components/ui/markdown-textarea.tsx`, for app-surface markdown fields.

The component contract should be:

- Plain text only. No rich editor runtime.
- Monospace, source-visible presentation.
- Browser text-assistance turned down for markdown entry.
- Reusable across settings/forms with caller-controlled sizing.

### Surfaces in scope

- **Automation instructions**
  Keep the current debounced autosave flow, but render the editor through `MarkdownTextarea`.
- **Agent memory / context**
  Render both “Client profile” and “User preferences” through `MarkdownTextarea`.

### Explicitly out of scope

- Chat composer
- CRM note fields / inline textareas
- Meeting notepad
- Skills markdown viewer
- Any Notion-like rich editing surface

Those are different product surfaces with different editing jobs. They should not be pulled into this standard unless they become markdown-backed app settings/forms too.

## Technical Considerations

- Keep the abstraction shallow. One shared component is enough.
- Do not add editor state machines, markdown preview panes, slash commands, toolbar chrome, or storage changes.
- Prefer a component-level contract over duplicated per-surface styling.
- Lock the behavior with focused tests on the surfaced inputs, not with a broad snapshot suite.

## Acceptance Criteria

- [ ] `AutomationInstructions` uses the shared markdown textarea.
- [ ] `AgentContextForm` uses the shared markdown textarea for both editable fields.
- [ ] The shared markdown textarea has a stable plain-text input contract appropriate for markdown entry.
- [ ] The in-scope surface tests cover that contract so future regressions are caught quickly.
- [ ] No new dependencies, migrations, or backend changes are introduced.

## Quality Gates

- [ ] Focused Vitest coverage for automation instructions and agent context passes.
- [ ] Shared markdown input behavior is codified in tests before any further production changes.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Standard drifts again through ad hoc textareas | Medium | Keep the contract in one component and test the current surfaces directly. |
| Team later needs rich document editing | Medium | Treat that as a separate product surface and introduce exactly one rich editor then. |
| Scope expands into every textarea in the app | Low | Keep this plan explicitly limited to markdown-backed app settings/forms. |

## Out of Scope

- Replacing the read-only markdown renderer
- Migrating chat or CRM composition surfaces
- Adding markdown preview, syntax highlighting, or WYSIWYG editing
- Reworking autosave semantics on automation instructions
