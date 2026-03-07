# Multimodal Chat Reference — vercel/chatbot

> **Source repo:** [vercel/chatbot](https://github.com/vercel/chatbot) (local clone: `/Users/sethlim/Documents/chatbot`)
> **Feature:** Image/file attachments in chat messages
> **Date:** 2026-03-07

---

## 1. Architecture Overview

The Vercel chatbot implements multimodal (image attachment) chat with a clean 4-layer pipeline:

```
Upload → Attach → Send (parts[]) → Render
```

| Layer | What happens | Key file |
|-------|-------------|----------|
| **Upload** | File → Vercel Blob (public URL) | `app/(chat)/api/files/upload/route.ts` |
| **Attach** | Client holds `Attachment[]` state, shows preview | `components/multimodal-input.tsx` |
| **Send** | Message sent as `parts: [file, file, text]` | `components/multimodal-input.tsx` → `app/(chat)/api/chat/route.ts` |
| **Render** | Filter parts by type, render previews in message | `components/message.tsx` + `components/preview-attachment.tsx` |

---

## 2. Pattern-by-Pattern Documentation

### 2.1 File Upload API Route

**File:** `app/(chat)/api/files/upload/route.ts`

**Pattern:**
- POST endpoint accepts `FormData` with a single `file` field
- Validates with Zod: max 5MB, JPEG/PNG only
- Stores in Vercel Blob (`@vercel/blob` `put()`) with public access
- Returns `{ url, pathname, contentType }`

```typescript
// Zod schema for upload validation
const FileSchema = z.object({
  file: z
    .instanceof(Blob)
    .refine((file) => file.size <= 5 * 1024 * 1024, {
      message: "File size should be less than 5MB",
    })
    .refine((file) => ["image/jpeg", "image/png"].includes(file.type), {
      message: "File type should be JPEG or PNG",
    }),
});

// Handler: auth → validate → upload → return metadata
export async function POST(request: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get("file") as Blob;
  const validatedFile = FileSchema.safeParse({ file });
  // ... validation error handling ...

  const filename = (formData.get("file") as File).name;
  const data = await put(`${filename}`, await file.arrayBuffer(), { access: "public" });
  return NextResponse.json(data);
}
```

### 2.2 Attachment Type

**File:** `lib/types.ts`

```typescript
export type Attachment = {
  name: string;
  url: string;
  contentType: string;
};
```

Simple, flat type. No `id`, no `size`, no `File` reference. Just the three fields needed for display and sending.

### 2.3 MultimodalInput Component

**File:** `components/multimodal-input.tsx`

This is the core client component. Key patterns:

#### State management
```typescript
const [attachments, setAttachments] = useState<Attachment[]>([]);
const [uploadQueue, setUploadQueue] = useState<string[]>([]); // filenames being uploaded
const fileInputRef = useRef<HTMLInputElement>(null);
```

#### Upload function
```typescript
const uploadFile = useCallback(async (file: File) => {
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch("/api/files/upload", { method: "POST", body: formData });
  if (response.ok) {
    const { url, pathname, contentType } = await response.json();
    return { url, name: pathname, contentType };
  }
  const { error } = await response.json();
  toast.error(error);
}, []);
```

#### File selection handler
```typescript
const handleFileChange = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
  const files = Array.from(event.target.files || []);
  setUploadQueue(files.map((file) => file.name)); // Show uploading state

  const uploadPromises = files.map((file) => uploadFile(file));
  const uploadedAttachments = await Promise.all(uploadPromises);
  const successfullyUploadedAttachments = uploadedAttachments.filter(
    (attachment) => attachment !== undefined
  );

  setAttachments((curr) => [...curr, ...successfullyUploadedAttachments]);
  setUploadQueue([]);
}, [setAttachments, uploadFile]);
```

#### Paste handler (images from clipboard)
```typescript
const handlePaste = useCallback(async (event: ClipboardEvent) => {
  const items = event.clipboardData?.items;
  const imageItems = Array.from(items).filter((item) => item.type.startsWith("image/"));
  if (imageItems.length === 0) return;

  event.preventDefault();
  setUploadQueue((prev) => [...prev, "Pasted image"]);

  const uploadPromises = imageItems
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null)
    .map((file) => uploadFile(file));

  const uploadedAttachments = await Promise.all(uploadPromises);
  setAttachments((curr) => [...curr, ...successfullyUploadedAttachments]);
  setUploadQueue([]);
}, [setAttachments, uploadFile]);

// Registered via addEventListener (not React onPaste) for native clipboard access
useEffect(() => {
  const textarea = textareaRef.current;
  textarea?.addEventListener("paste", handlePaste);
  return () => textarea?.removeEventListener("paste", handlePaste);
}, [handlePaste]);
```

#### Submit — constructing message parts
```typescript
const submitForm = useCallback(() => {
  sendMessage({
    role: "user",
    parts: [
      ...attachments.map((attachment) => ({
        type: "file" as const,
        url: attachment.url,
        name: attachment.name,
        mediaType: attachment.contentType,
      })),
      { type: "text", text: input },
    ],
  });

  setAttachments([]);
  setInput("");
}, [input, attachments, sendMessage, ...]);
```

#### Hidden file input + attachment button
```typescript
<input
  className="pointer-events-none fixed -top-4 -left-4 size-0.5 opacity-0"
  multiple
  onChange={handleFileChange}
  ref={fileInputRef}
  tabIndex={-1}
  type="file"
/>

// Button triggers the hidden input:
<Button onClick={() => fileInputRef.current?.click()} disabled={status !== "ready"}>
  <PaperclipIcon />
</Button>
```

#### Attachment preview area (inside input)
```typescript
{(attachments.length > 0 || uploadQueue.length > 0) && (
  <div className="flex flex-row items-end gap-2 overflow-x-scroll">
    {attachments.map((attachment) => (
      <PreviewAttachment
        attachment={attachment}
        key={attachment.url}
        onRemove={() => {
          setAttachments((curr) => curr.filter((a) => a.url !== attachment.url));
        }}
      />
    ))}
    {uploadQueue.map((filename) => (
      <PreviewAttachment
        attachment={{ url: "", name: filename, contentType: "" }}
        isUploading={true}
        key={filename}
      />
    ))}
  </div>
)}
```

### 2.4 PreviewAttachment Component

**File:** `components/preview-attachment.tsx`

Reused in both the input area (with `onRemove`) and message rendering (without `onRemove`).

```typescript
export const PreviewAttachment = ({
  attachment,
  isUploading = false,
  onRemove,
}: {
  attachment: Attachment;
  isUploading?: boolean;
  onRemove?: () => void;
}) => {
  const { name, url, contentType } = attachment;
  return (
    <div className="group relative size-16 overflow-hidden rounded-lg border bg-muted">
      {contentType?.startsWith("image") ? (
        <Image alt={name ?? "An image attachment"} className="size-full object-cover"
          height={64} src={url} width={64} />
      ) : (
        <div className="flex size-full items-center justify-center text-muted-foreground text-xs">
          File
        </div>
      )}
      {isUploading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <Loader size={16} />
        </div>
      )}
      {onRemove && !isUploading && (
        <Button className="absolute top-0.5 right-0.5 size-4 rounded-full p-0 opacity-0
          transition-opacity group-hover:opacity-100"
          onClick={onRemove} size="sm" variant="destructive">
          <CrossSmallIcon size={8} />
        </Button>
      )}
      <div className="absolute inset-x-0 bottom-0 truncate bg-linear-to-t from-black/80
        to-transparent px-1 py-0.5 text-[10px] text-white">
        {name}
      </div>
    </div>
  );
};
```

### 2.5 Chat API Route — Handling File Parts

**File:** `app/(chat)/api/chat/route.ts`

The API route receives the message with file parts, saves them, and passes them through to the model:

```typescript
// Save user message with parts (including file parts)
if (message?.role === "user") {
  await saveMessages({
    messages: [{
      chatId: id,
      id: message.id,
      role: "user",
      parts: message.parts,   // File parts included as-is
      attachments: [],         // Legacy field, not used
      createdAt: new Date(),
    }],
  });
}

// Convert UI messages to model messages — AI SDK handles file URLs automatically
const modelMessages = await convertToModelMessages(uiMessages);

// Stream with the model
const result = streamText({
  model: getLanguageModel(selectedChatModel),
  system: systemPrompt({ selectedChatModel, requestHints }),
  messages: modelMessages,  // File parts are converted to model-compatible format by AI SDK
  // ...
});
```

### 2.6 Chat API Schema — Validating File Parts

**File:** `app/(chat)/api/chat/schema.ts`

```typescript
const textPartSchema = z.object({
  type: z.enum(["text"]),
  text: z.string().min(1).max(2000),
});

const filePartSchema = z.object({
  type: z.enum(["file"]),
  mediaType: z.enum(["image/jpeg", "image/png"]),
  name: z.string().min(1).max(100),
  url: z.string().url(),
});

const partSchema = z.union([textPartSchema, filePartSchema]);

const userMessageSchema = z.object({
  id: z.string().uuid(),
  role: z.enum(["user"]),
  parts: z.array(partSchema),
});
```

### 2.7 Message Rendering — Displaying File Parts

**File:** `components/message.tsx`

```typescript
// Extract file attachments from message parts
const attachmentsFromMessage = message.parts.filter(
  (part) => part.type === "file"
);

// Render attachments above the text
{attachmentsFromMessage.length > 0 && (
  <div className="flex flex-row justify-end gap-2">
    {attachmentsFromMessage.map((attachment) => (
      <PreviewAttachment
        attachment={{
          name: attachment.filename ?? "file",
          contentType: attachment.mediaType,
          url: attachment.url,
        }}
        key={attachment.url}
      />
    ))}
  </div>
)}
```

### 2.8 Database Schema

**File:** `lib/db/schema.ts`

```sql
CREATE TABLE "Message_v2" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "chatId" uuid NOT NULL REFERENCES "Chat"("id"),
  "role" varchar NOT NULL,
  "parts" json NOT NULL,        -- Stores all parts including file parts
  "attachments" json NOT NULL,  -- Legacy, always []
  "createdAt" timestamp NOT NULL
);
```

The `parts` column stores the full array of parts as JSON. File parts look like:
```json
[
  { "type": "file", "url": "https://blob.vercel-storage.com/...", "name": "photo.jpg", "mediaType": "image/jpeg" },
  { "type": "text", "text": "What's in this image?" }
]
```

---

## 3. Files to Copy / Reference

### Must-copy files (new)

| Reference file | Our target file | Notes |
|---------------|----------------|-------|
| `components/preview-attachment.tsx` | `src/components/chat/preview-attachment.tsx` | Copy exactly. Reusable in input + message rendering. |
| `app/(chat)/api/files/upload/route.ts` | `app/api/files/upload/route.ts` | Adapt: Supabase Storage instead of Vercel Blob. Supabase Auth instead of NextAuth. |

### Must-modify files (existing)

| File to modify | What changes |
|---------------|-------------|
| `src/components/chat/chat-composer.tsx` | Add attachment state, upload logic, paste handler, attachment preview, file input. Model the full pattern from `multimodal-input.tsx`. |
| `src/components/chat/chat-panel.tsx` | Pass attachment state down; update `handleSubmit` to construct `parts[]` with file parts. Use `sendMessage()` with parts instead of `sendMessage({ text })`. |
| `src/components/chat/message-list.tsx` | No change needed — delegates to `MessageBubble`. |
| `src/components/chat/message-bubble.tsx` | Add rendering for file parts (extract from `message.parts`, render `PreviewAttachment`). |
| `app/api/chat/route.ts` | Pass file parts through to runner. Currently extracts only text from parts — must also forward file parts to `runAgent`. |
| `app/api/chat/schema.ts` | Already has `filePartSchema` — no changes needed. |
| `src/lib/runner/run-agent.ts` | Accept file parts in input and include in model messages. |
| `src/lib/chat/messages.ts` | Ensure `parts` field preserves file parts when saving. Already stores `parts` as JSON — just verify it round-trips correctly. |

### Reference-only files (read for patterns, don't copy)

| File | Why reference it |
|------|-----------------|
| `lib/types.ts` | `Attachment` type definition, `ChatMessage` with `UIMessage` generics |
| `app/(chat)/api/chat/route.ts` | How `convertToModelMessages()` handles file parts, `onFinish` persistence |
| `components/message.tsx` | Full message part rendering loop (text, file, tool, reasoning) |

---

## 4. Where We Drift Today

### 4.1 File Storage — Vercel Blob vs. Supabase Storage

| Aspect | Reference (vercel/chatbot) | Sunder (ours) |
|--------|--------------------------|---------------|
| **Storage** | Vercel Blob (`@vercel/blob`) | Supabase Storage |
| **Upload API** | `put(filename, buffer, { access: "public" })` | `supabase.storage.from('bucket').upload(path, buffer)` |
| **Return URL** | Direct blob URL from `put()` response | `supabase.storage.from('bucket').getPublicUrl(path)` |
| **Auth** | NextAuth `auth()` | Supabase `supabase.auth.getUser()` |

**Drift reason:** We use Supabase for everything (auth, storage, DB). Vercel Blob is not in our stack. This is the **only justified drift** — the upload route implementation changes, but the API contract (POST FormData, return `{ url, pathname, contentType }`) stays identical.

**What to do:** Write our upload route to return the same `{ url, pathname, contentType }` shape. The client code (multimodal-input) does not need to change.

### 4.2 Chat Composer — Two Surfaces

| Aspect | Reference | Sunder |
|--------|-----------|--------|
| **Chat input** | Single `MultimodalInput` for all chat | Two surfaces: `ChatComposer` (main chat) and `ChatInput` (analyst) |
| **Analyst chat** | N/A | Separate hook (`use-analyst-chat.ts`) with its own image handling |

**Drift reason:** We have two chat surfaces. The main chat (`ChatPanel` → `ChatComposer`) currently has **no** attachment support. The analyst chat (`ChatInput`) has its own image handling using client-side base64 conversion (not server upload).

**What to do:**
1. Add multimodal to `ChatComposer` using the reference pattern exactly.
2. The analyst chat is a separate feature with different needs (doc filters, template files) — leave it as-is for now.

### 4.3 Message Sending — `sendMessage({ text })` vs. `sendMessage({ parts })`

| Aspect | Reference | Sunder |
|--------|-----------|--------|
| **Send** | `sendMessage({ role: "user", parts: [...] })` | `sendMessage({ text })` |
| **Parts construction** | Client builds parts array with file + text | Client sends plain text only |

**Drift reason:** We haven't implemented multimodal yet. Our `ChatPanel.handleSubmit` calls `sendMessage({ text })` which is the simple text-only overload.

**What to do:** Change to `sendMessage({ role: "user", parts: [...] })` exactly as the reference does.

### 4.4 Runner Input — Text-Only vs. Parts

| Aspect | Reference | Sunder |
|--------|-----------|--------|
| **Runner input** | `convertToModelMessages(uiMessages)` — AI SDK converts parts to model format | `runAgent({ input: string })` — text only |
| **Model call** | `messages: modelMessages` (includes images) | `messages: createMessages(...)` — text only |

**Drift reason:** Our runner was built for text-only chat. The `runAgent` function accepts `input: string`, not structured parts.

**What to do:** Extend `runAgent` to accept `parts` (or the full user message) so file parts reach the model. The AI SDK's `convertToModelMessages()` handles the conversion from UI parts to model-compatible messages with image content automatically.

### 4.5 Message Persistence — Schema Alignment

| Aspect | Reference | Sunder |
|--------|-----------|--------|
| **Parts column** | `parts json NOT NULL` | `parts json NULL` (nullable) |
| **Attachments column** | `attachments json NOT NULL` (legacy, always `[]`) | Does not exist |
| **Content column** | Does not exist | `content text NULL` (plain text fallback) |

**Drift reason:** Our schema was built before multimodal. We have a `content` field for plain text and nullable `parts`. The reference has no `content` field and non-nullable `parts`.

**What to do:** No schema migration needed. Our `parts` column already accepts JSON. File parts will be stored in `parts` just like text parts. The `content` field can remain as a fallback for compatibility with other features that read plain text.

### 4.6 Request Schema — Already Aligned

Our `app/api/chat/schema.ts` already has `filePartSchema` with `type: "file"`, `url`, `name`, `mediaType`. **No drift.** This was forward-looking.

---

## 5. Implementation Checklist

### Phase 1: Upload Route (Supabase Storage adaptation)

- [ ] Create `app/api/files/upload/route.ts`
  - Auth via Supabase
  - Validate with same Zod schema (5MB, JPEG/PNG)
  - Upload to Supabase Storage bucket (e.g., `chat-attachments`)
  - Return `{ url, pathname, contentType }` (same contract)

### Phase 2: PreviewAttachment Component

- [ ] Copy `components/preview-attachment.tsx` → `src/components/chat/preview-attachment.tsx`
  - Adjust imports (use our `Button`, etc.)
  - Otherwise copy exactly

### Phase 3: ChatComposer Multimodal

- [ ] Add to `src/components/chat/chat-composer.tsx`:
  - `attachments` state (`Attachment[]`)
  - `uploadQueue` state (`string[]`)
  - `uploadFile()` callback
  - `handleFileChange()` callback
  - `handlePaste()` callback with `addEventListener`
  - Hidden `<input type="file">` with ref
  - Paperclip button
  - Preview area with `PreviewAttachment`
  - Update submit to build `parts[]`

### Phase 4: ChatPanel Integration

- [ ] Update `src/components/chat/chat-panel.tsx`:
  - Change `handleSubmit` from `sendMessage({ text })` to `sendMessage({ role: "user", parts: [...] })`
  - Pass attachment-related props to `ChatComposer`

### Phase 5: Message Rendering

- [ ] Update `src/components/chat/message-bubble.tsx`:
  - Filter `message.parts` for `type === "file"`
  - Render `PreviewAttachment` for each file part

### Phase 6: Runner Integration

- [ ] Extend `runAgent` input to accept file parts
- [ ] Ensure file parts reach `streamText()` via `convertToModelMessages()`
- [ ] Verify `finalizeRun` persists file parts in `conversation_messages.parts`

---

## 6. Principles

1. **Minimal drift.** The only justified drift is Supabase Storage instead of Vercel Blob. Everything else — types, component structure, upload flow, message parts format, rendering — should match the reference exactly.

2. **Same API contract.** Upload route returns `{ url, pathname, contentType }`. Client code does not need to know the storage backend.

3. **Parts-first messaging.** Messages are `parts[]`, not `content: string`. File parts and text parts coexist in the same array.

4. **Reusable PreviewAttachment.** One component used in both input preview and message rendering.

5. **Upload-then-attach.** Files are uploaded immediately on selection, not on message send. The attachment holds a URL, not a File reference.

---

## 7. Key AI SDK Functions Used

| Function | Import | Purpose |
|----------|--------|---------|
| `sendMessage` | `@ai-sdk/react` `useChat()` | Send message with structured parts |
| `convertToModelMessages` | `ai` | Convert UI parts (including files) to model-compatible format |
| `createUIMessageStream` | `ai` | Create streaming response |
| `createUIMessageStreamResponse` | `ai` | Wrap stream as HTTP response |
| `streamText` | `ai` | Call LLM with messages that include image content |

The AI SDK's `convertToModelMessages()` is the critical bridge — it takes file parts with URLs and converts them into the model-specific format (e.g., inline image content for vision models). **We do not need to manually convert images to base64 for the model call.**
