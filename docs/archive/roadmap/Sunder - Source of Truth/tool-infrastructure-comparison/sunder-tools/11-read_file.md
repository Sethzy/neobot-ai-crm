# 11. read_file

- Group: Storage Tools
- Category: Read
- Source: `src/lib/runner/tools/storage/index.ts`
- Factory: `createStorageTools(supabase, clientId)`

## Verbatim Definition

```typescript
const readFileInputSchema = z.object({
  path: z.string().describe("Relative file or directory path in the client workspace."),
  start_line: z.number().int().min(1).optional().describe("Optional 1-indexed start line."),
  end_line: z.number().int().min(1).optional().describe("Optional 1-indexed end line (inclusive)."),
});

const read_file = tool({
  description:
    "Read file content or list a directory tree. Use directory paths (e.g. memory/) for discovery.",
  inputSchema: readFileInputSchema,
  execute: async ({ path, start_line, end_line }) => {
    const isDirectoryPath = path === "" || path.endsWith("/");

    if (isDirectoryPath) {
      const directoryPath = path.replace(/\/+$/, "");
      const content = await fileClient.listDirectory(directoryPath);
      return { success: true as const, path, content };
    }

    try {
      const rawContent = await fileClient.downloadFile(path);
      const slicedContent = applyLineRange(rawContent, start_line, end_line);

      return { success: true as const, path, content: slicedContent };
    } catch (fileError) {
      if (!shouldFallbackToDirectory(fileError)) {
        throw fileError;
      }

      try {
        const content = await fileClient.listDirectory(path);
        return { success: true as const, path, content };
      } catch {
        throw fileError;
      }
    }
  },
});
```

## Helper: Line Range Slicing

```typescript
function applyLineRange(content: string, startLine?: number, endLine?: number): string {
  if (startLine === undefined && endLine === undefined) {
    return content;
  }

  if (startLine !== undefined && startLine < 1) {
    throw new Error("start_line must be >= 1.");
  }

  if (endLine !== undefined && endLine < 1) {
    throw new Error("end_line must be >= 1.");
  }

  if (startLine !== undefined && endLine !== undefined && endLine < startLine) {
    throw new Error("end_line must be greater than or equal to start_line.");
  }

  const lines = content.split("\n");
  const totalLines = lines.length;

  const toIndex = (value: number, isEnd = false): number => {
    const fromStart = value - 1 + (isEnd ? 1 : 0);
    return Math.max(0, fromStart);
  };

  const startIndex = startLine === undefined ? 0 : toIndex(startLine);
  const endIndex = endLine === undefined ? totalLines : toIndex(endLine, true);

  return lines.slice(startIndex, endIndex).join("\n");
}
```

## Helper: Directory Fallback

```typescript
function shouldFallbackToDirectory(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();

  if (message.includes("permission denied") || message.includes("forbidden") || message.includes("unauthorized")) {
    return false;
  }

  if (message.includes("bucket not found")) {
    return false;
  }

  return message.includes("object not found")
    || message.includes("file not found")
    || message.includes("no such file");
}
```

## Input Schema

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `path` | `string` | Yes | Relative file or directory path in client workspace |
| `start_line` | `integer` | No | 1-indexed start line |
| `end_line` | `integer` | No | 1-indexed end line (inclusive) |

## Result Shape

```typescript
// Success (file or directory)
{ success: true, path: string, content: string }
```

## Notes

- Dual-mode: reads files OR lists directories
- Trailing `/` signals directory intent; otherwise tries file first, falls back to directory on "not found"
- Permission errors (403, unauthorized) are NOT silently fallen back — they propagate
- Line slicing is 1-indexed and inclusive (matches Tasklet's convention)
- No negative indexing support (unlike Tasklet's read_file)
- Uses `createAgentFileClient(supabase, clientId)` for Supabase Storage operations
