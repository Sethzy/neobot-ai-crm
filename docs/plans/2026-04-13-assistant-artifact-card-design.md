# Assistant Artifact Card Design

**Goal:** Render assistant-generated file outputs in chat as first-class artifact cards instead of burying them as inline download links.

**Status:** Validated design, ready for implementation.

## Summary

Sunder currently renders assistant file parts with the same compact attachment tile used for user uploads. That presentation works for input attachments but undersells assistant deliverables. Users should see assistant-produced files as explicit outputs they can act on.

The design keeps the existing file data flow intact and only changes the assistant-side presentation layer. User-upload previews remain compact. Assistant file parts render through a dedicated artifact card component with stronger hierarchy: file icon, filename, file type label, and a clear download action.

This is a local chat UI change, not a storage or message-schema redesign.

## User Story

As a user in chat, when the assistant produces a file such as a CSV, PDF, image, or markdown document, I should immediately recognize it as a deliverable and know exactly where to click to open or download it.

As a user uploading inputs to the assistant, I should keep the current compact upload preview behavior so the composer and user-side message layout do not get noisier.

## Scope

### In scope

- Add a dedicated assistant-only artifact card UI for file parts in assistant messages
- Keep user upload previews unchanged
- Reuse existing file-part data and URL resolution
- Preserve legacy `url`-only file-part compatibility
- Preserve image lightbox behavior where it already exists

### Out of scope

- New backend routes or new file schemas
- Download progress indicators
- Signed-link refresh UX
- File preview modals for all file types
- Multi-action menus
- General attachment-system rewrite

## Recommended Approach

Create a new `AssistantArtifactCard` component and use it only when rendering assistant message file parts.

Do not generalize the existing `PreviewAttachment` component. It already serves a different job: compact upload and thumbnail preview. Combining both modes into one polymorphic attachment component would increase branching and make the chat UI harder to reason about.

## Current State

Assistant and user file parts are both rendered through `PreviewAttachment` in:

- [src/components/chat/message-bubble.tsx](/Users/sethlim/Documents/sunder-next-migration-20260225/src/components/chat/message-bubble.tsx)

Resolved download URLs are already handled by:

- [src/components/chat/file-parts.ts](/Users/sethlim/Documents/sunder-next-migration-20260225/src/components/chat/file-parts.ts)

The current compact preview component is:

- [src/components/chat/preview-attachment.tsx](/Users/sethlim/Documents/sunder-next-migration-20260225/src/components/chat/preview-attachment.tsx)

This means the artifact-card change can stay local to the chat rendering layer.

## Proposed Component Model

### New component

Add a dedicated component:

- `src/components/chat/assistant-artifact-card.tsx`

Expected props:

```ts
interface AssistantArtifactCardProps {
  attachment: {
    filename: string;
    url: string;
    contentType: string;
    storagePath?: string;
  };
  onImageClick?: (url: string) => void;
}
```

### Rendering rules

- User message + file part -> `PreviewAttachment`
- Assistant message + file part -> `AssistantArtifactCard`
- Legacy file parts without `storagePath` still use their direct `url`
- Assistant image files can still support image preview, but through the artifact card shell

## Visual Design

The artifact card should look like a distinct, actionable object rather than part of the assistant prose.

### Structure

- Left: file icon or file-type badge
- Middle:
  - primary text: filename
  - secondary text: file type label
- Right: explicit download action

### Styling goals

- bordered card surface
- rounded corners
- enough padding to separate it from prose
- clear action affordance on both desktop and mobile
- preserve current design-system patterns and tokens

### Behavioral goals

- the card should be individually clickable or contain a clearly clickable action
- keyboard accessible via button or anchor semantics
- no hidden “guess where to click” interaction

## Data Flow

No new backend or agent contract is required.

Existing flow remains:

1. Managed-agent or chat backend emits a file part
2. `message-bubble.tsx` receives the file part
3. `resolveFilePartUrl()` resolves `storagePath` into `/api/files/download?...` when available
4. Assistant file parts render through `AssistantArtifactCard`
5. User file parts continue through `PreviewAttachment`

This preserves the current durable file model and download signing behavior.

## Risks

- Accidentally replacing compact user upload previews with the richer artifact card
- Regressing image lightbox behavior for assistant image files
- Breaking old `url`-only file parts
- Creating awkward spacing for assistant messages that mix text and file outputs

## Testing Plan

### Automated

Add or update tests for:

- `AssistantArtifactCard` renders filename and file type label
- `AssistantArtifactCard` links to the resolved download URL
- assistant file parts render as artifact cards
- user file parts still render as compact preview attachments
- legacy `url`-only file parts still work
- assistant image file parts still support current preview behavior

Primary test targets:

- `src/components/chat/assistant-artifact-card.test.tsx`
- `src/components/chat/message-bubble.test.tsx`

### Manual QA

Verify in chat:

1. Assistant-generated CSV renders as a distinct card
2. Clicking the action downloads or opens the file correctly
3. Assistant-generated image still previews reasonably
4. User-upload previews in the composer remain unchanged
5. User file parts in user messages remain unchanged

## Open Question

For the first implementation, should the action be:

- a text button like `Download`
- or an icon-only button like the reference screenshot

Current recommendation: ship a text button first because it is clearer and lower-risk.
