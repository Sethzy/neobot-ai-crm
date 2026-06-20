# 12. write_file

- Group: Storage Tools
- Category: Write
- Source: `src/lib/runner/tools/storage/index.ts`
- Factory: `createStorageTools(supabase, clientId)`

## Verbatim Definition

```typescript
const writeFileInputSchema = z.object({
  op: z.enum(["write", "edit", "delete"]),
  path: z.string().describe("Relative file path in the client workspace."),
  content: z.string().optional().describe("Required for write operations."),
  old_string: z.string().optional().describe("Required for edit operations."),
  new_string: z.string().optional().describe("Required for edit operations."),
  replace_all: z.boolean().optional().default(false),
});

const write_file = tool({
  description: "Write, edit, or delete files in the client workspace.",
  inputSchema: writeFileInputSchema,
  execute: async ({ op, path, content, old_string, new_string, replace_all }) => {
    const pathKind = classifyStoragePath(path);

    switch (op) {
      case "write": {
        if (content === undefined) {
          throw new Error("write op requires content.");
        }

        await fileClient.uploadFile(path, content);
        await runPathAwareSync({ op, path, pathKind });
        return { success: true as const, op, path, path_kind: pathKind };
      }

      case "edit": {
        if (old_string === undefined || new_string === undefined) {
          throw new Error("edit op requires old_string and new_string.");
        }

        const updatedContent = await fileClient.editFile(path, old_string, new_string, replace_all);
        await runPathAwareSync({ op, path, pathKind });
        return { success: true as const, op, path, content: updatedContent, path_kind: pathKind };
      }

      case "delete": {
        await fileClient.deleteFile(path);
        await runPathAwareSync({ op, path, pathKind });
        return { success: true as const, op, path, path_kind: pathKind };
      }
    }
  },
});
```

## Helper: Path Classification

```typescript
type StoragePathKind = "vault" | "skills" | "general";

function classifyStoragePath(path: string): StoragePathKind {
  const normalizedPath = path.replace(/^\/+/, "");

  if (normalizedPath === "vault" || normalizedPath.startsWith("vault/")) {
    return "vault";
  }

  if (normalizedPath === "skills" || normalizedPath.startsWith("skills/")) {
    return "skills";
  }

  return "general";
}
```

## Helper: Path-Aware Sync (Placeholder)

```typescript
async function runPathAwareSync(params: {
  op: "write" | "edit" | "delete";
  path: string;
  pathKind: StoragePathKind;
}): Promise<void> {
  if (params.pathKind === "general") {
    return;
  }

  // DATA-06 follow-up hooks:
  // - vault/* paths should update vault_files metadata/content when PR12a lands.
  // - skills/* paths should update skill_registry metadata when PR23 lands.
  // This placeholder keeps write_file path-aware without introducing premature schema coupling.
}
```

## Input Schema

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `op` | `enum` | Yes | write, edit, delete |
| `path` | `string` | Yes | Relative file path in client workspace |
| `content` | `string` | Required for write | File content to write |
| `old_string` | `string` | Required for edit | String to find and replace |
| `new_string` | `string` | Required for edit | Replacement string |
| `replace_all` | `boolean` | No | Replace all occurrences. Defaults to false |

## Result Shape

```typescript
// Success (write/delete)
{ success: true, op: string, path: string, path_kind: StoragePathKind }

// Success (edit — includes updated content)
{ success: true, op: "edit", path: string, content: string, path_kind: StoragePathKind }
```

## Notes

- Three sub-operations via `op` discriminator (write, edit, delete)
- Edit uses find-and-replace with optional `replace_all` flag
- Path classification enables future hooks for vault/skills sync
- No system prompt approval guidance for write_file (unlike CRM write tools)
- Storage scoped to `/{clientId}/` via `createAgentFileClient`
