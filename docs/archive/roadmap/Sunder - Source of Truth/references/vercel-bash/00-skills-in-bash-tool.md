# Use Skills in Your AI SDK Agents via bash-tool

**Source:** Vercel Blog / Changelog
**Author:** Malte Ubl, CTO, Vercel
**Date:** Jan 21, 2026

---

Skills support is now available in `bash-tool`, so your AI SDK agents can use the skills pattern with filesystem context, Bash execution, and sandboxed runtime access.

This gives your agent a consistent way to pull in the right context for a task, using the same isolated execution model that powers filesystem-based context retrieval.

This allows giving your agent access to the wide variety of publicly available skills, or for you to write your own proprietary skills and privately use them in your agent.

## Example

```ts
import {
  experimental_createSkillTool as createSkillTool,
  createBashTool,
} from "bash-tool";
import { ToolLoopAgent } from "ai";

// Discover skills and get files to upload
const { skill, files, instructions } = await createSkillTool({
  skillsDirectory: "./skills",
});

// Create bash tool with skill files
const { tools } = await createBashTool({
  files,
  extraInstructions: instructions,
});

// Use both tools with an agent
const agent = new ToolLoopAgent({
  model,
  tools: { skill, ...tools },
});
```

*Example of using skills with bash-tool in an AI SDK ToolLoopAgent*

## Key APIs

- `createSkillTool` — discovers skills from a directory, returns skill tool + files + instructions
- `createBashTool` — creates bash execution tool, accepts uploaded files and extra instructions

## Links

- bash-tool changelog
- `createSkillTool` documentation
