# The Second Wave of MCP: Building for LLMs, Not Developers

> Source: https://vercel.com/blog/the-second-wave-of-mcp-building-for-llms-not-developers
> Authors: Boris Besemer (Senior Platform Architect), Andrew Qu (Chief of Software, Vercel)
> Published: Sep 9, 2025

Many early MCP servers were thin wrappers around existing APIs. This worked initially but creates problems because LLMs don't work like developers — each conversation starts fresh with no memory, and low-level API wrappers force LLMs to repeatedly solve the same orchestration puzzles.

## Core Insight

MCP works best when tools handle **complete user intentions** rather than exposing individual API operations. One tool that deploys a project end-to-end works better than four tools that each handle a piece of the deployment pipeline.

## How LLMs Use APIs Differently

When developers write code, they:
- Keep track of information between API calls
- Store IDs from create calls for use in subsequent calls
- Wrap error handling around each step
- Solve the orchestration once and reuse

LLMs work differently:
- Each conversation starts fresh with no memory of previous conversations
- They have to figure out the right sequence of tools based on what's available
- With low-level API wrappers, the LLM has to orchestrate multiple calls and manage chaining complexity **each time**

## API-Shaped vs. Intention-Based Tools

| API-shaped tools | Intention-based tools |
|---|---|
| `create_project`, `add_env`, `deploy`, `add_domain` | `deploy_project` |
| Multiple calls with state management | Single atomic operation |
| Returns technical status codes | Returns conversational updates |
| LLM assembles the workflow | Tool owns the complete process |

### Bad: Four separate tools

```
create_project(name, repo)
add_environment_variables(project_id, variables)
create_deployment(project_id, branch)
add_domain(project_id, domain)
```

The LLM must call each in sequence, pass IDs between calls, and handle failures at each step.

### Good: One intention-based tool

```
deploy_project(repo_url, domain, environment_variables, branch="main")
```

Single tool handles the complete workflow internally. Returns conversational response instead of `{ status: 200, data: { id: "proj_123" } }`.

## Designing Workflow-Based MCP Tools

1. **Test the workflow manually first** — Walk through a real user request step by step using existing APIs. The parts that feel tedious or repetitive are good candidates for a single MCP tool.

2. **Think of MCP tools as tailored toolkits** — Not API mirrors. Multiple APIs and business logic can live behind a single MCP tool. If users think of something as one workflow, design it as one tool.

3. **Use plain code for deterministic parts** — API sequencing, error recovery, and state management are better suited for regular programming. Only involve the LLM for parts that truly need reasoning or natural language processing.

4. **Test with real scenarios** — Run actual user workflows through your tools. When the LLM makes multiple attempts or asks for clarification, that's feedback about your tool design. Goal: complex workflows succeed on the first try.

## Example: Workflow Tool Structure

```typescript
server.tool(
  "deploy_project",
  "Deploy a project with environment variables and custom domain",
  {
    repo_url: z.string(),
    domain: z.string(),
    environment_variables: z.record(z.string()),
    branch: z.string().default("main")
  },
  async ({ repo_url, domain, environment_variables, branch }) => {
    // Handle the complete workflow internally
    const project = await createProject(repo_url, branch);
    await addEnvironmentVariables(project.id, environment_variables);
    const deployment = await deployProject(project.id);
    await addCustomDomain(project.id, domain);

    return {
      content: [{
        type: "text",
        text: `Project deployed successfully at ${domain}. Build completed in ${deployment.duration}s.`
      }]
    };
  }
);
```

## Key Takeaways

Tools that work well share these traits:
- Focus on **user intentions** rather than API coverage
- Handle **complete workflows** rather than exposing single operations
- Respond in a **conversational way** rather than returning technical codes
- LLMs don't manage state the way developers do — building tools around workflows produces better results
