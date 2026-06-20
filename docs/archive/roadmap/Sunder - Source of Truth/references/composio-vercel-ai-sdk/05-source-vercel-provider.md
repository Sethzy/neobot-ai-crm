# VercelProvider Source Code

> Source: Cloned repo `ComposioHQ/composio`
> Path: `ts/packages/providers/vercel/`
> Version: 0.6.4

## src/index.ts (221 lines)

```typescript
/**
 * Vercel AI Provider
 * To be used with the Vercel AI SDK
 *
 * Author: Musthaq Ahamad <musthaq@composio.dev>
 * Legacy Reference: https://github.com/ComposioHQ/composio/blob/master/js/src/frameworks/vercel.ts
 *
 * This provider provides a set of tools for interacting with Vercel AI SDK.
 *
 * @packageDocumentation
 * @module providers/vercel
 */
import {
  BaseAgenticProvider,
  Tool,
  ExecuteToolFn,
  McpUrlResponse,
  McpServerGetResponse,
  removeNonRequiredProperties,
  jsonSchemaToZodSchema,
} from '@composio/core';
import type { ToolSet as VercelToolSet, Tool as VercelTool } from 'ai';
import { tool } from 'ai';

export type VercelToolCollection = VercelToolSet;
export class VercelProvider extends BaseAgenticProvider<
  VercelToolCollection,
  VercelTool,
  McpServerGetResponse
> {
  readonly name = 'vercel';
  private strict: boolean | null;

  constructor({ strict = false }: { strict?: boolean } = {}) {
    super();
    this.strict = strict;
  }

  wrapTool(composioTool: Tool, executeTool: ExecuteToolFn): VercelTool {
    const inputParams = composioTool.inputParameters;

    const parameters =
      this.strict && inputParams?.type === 'object'
        ? removeNonRequiredProperties(
            inputParams as {
              type: 'object';
              properties: Record<string, unknown>;
              required?: string[];
            }
          )
        : (inputParams ?? {});

    const inputParametersSchema = jsonSchemaToZodSchema(parameters);

    return tool({
      description: composioTool.description,
      inputSchema: inputParametersSchema,

      execute: async params => {
        const input = typeof params === 'string' ? JSON.parse(params) : params;
        return await executeTool(composioTool.slug, input);
      },
    });
  }

  wrapTools(tools: Tool[], executeTool: ExecuteToolFn): VercelToolCollection {
    return tools.reduce((acc, tool) => {
      acc[tool.slug] = this.wrapTool(tool, executeTool);
      return acc;
    }, {} as VercelToolCollection);
  }

  wrapMcpServerResponse(data: McpUrlResponse): McpServerGetResponse {
    return data.map(item => ({
      url: new URL(item.url),
      name: item.name,
    })) as McpServerGetResponse;
  }
}
```

## test/vercel.test.ts (220 lines)

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VercelProvider } from '../src';
import { Tool } from '@composio/core';
import { tool } from 'ai';

// Define an interface for our mocked Vercel tool
interface MockedVercelTool {
  description: string;
  inputSchema: any;
  execute: Function;
  _isMockedVercelTool: boolean;
}

// Mock the ai module
vi.mock('ai', () => {
  return {
    tool: vi.fn().mockImplementation(toolConfig => {
      return {
        ...toolConfig,
        _isMockedVercelTool: true,
      } as MockedVercelTool;
    }),
    jsonSchema: vi.fn().mockImplementation(schema => schema),
  };
});

describe('VercelProvider', () => {
  let provider: VercelProvider;
  let mockTool: Tool;
  let mockExecuteToolFn: any;

  beforeEach(() => {
    provider = new VercelProvider();

    // Mock the global execute tool function
    mockExecuteToolFn = vi.fn().mockResolvedValue({
      data: { result: 'success' },
      error: null,
      successful: true,
    });
    provider._setExecuteToolFn(mockExecuteToolFn);

    // Create a mock Composio tool
    mockTool = {
      slug: 'test-tool',
      name: 'Test Tool',
      description: 'A tool for testing',
      version: '20250909_00',
      availableVersions: ['20250909_00', '20250901_00'],
      inputParameters: {
        type: 'object',
        properties: {
          input: {
            type: 'string',
            description: 'Test input',
          },
        },
        required: ['input'],
      },
      tags: [],
    };

    vi.clearAllMocks();
  });

  describe('name property', () => {
    it('should have the correct name', () => {
      expect(provider.name).toBe('vercel');
    });
  });

  describe('_isAgentic property', () => {
    it('should be agentic', () => {
      expect(provider._isAgentic).toBe(true);
    });
  });

  describe('wrapTool', () => {
    it('should wrap a tool in Vercel tool format', () => {
      const wrapped = provider.wrapTool(mockTool, mockExecuteToolFn) as unknown as MockedVercelTool;

      expect(tool).toHaveBeenCalledWith({
        description: mockTool.description,
        inputSchema: expect.any(Object),
        execute: expect.any(Function),
      });

      expect(wrapped._isMockedVercelTool).toBe(true);
    });

    it('should handle tools without input parameters', () => {
      const toolWithoutParams: Tool = {
        ...mockTool,
        inputParameters: undefined,
      };

      const wrapped = provider.wrapTool(
        toolWithoutParams,
        mockExecuteToolFn
      ) as unknown as MockedVercelTool;

      expect(tool).toHaveBeenCalledWith({
        description: toolWithoutParams.description,
        inputSchema: expect.any(Object),
        execute: expect.any(Function),
      });
      expect(wrapped._isMockedVercelTool).toBe(true);
    });

    it('should create a function that executes the tool with the right parameters', async () => {
      provider.wrapTool(mockTool, mockExecuteToolFn) as unknown as MockedVercelTool;

      const executeFunction = (tool as any).mock.calls[0][0].execute;

      const params = { input: 'test-value' };
      await executeFunction(params);

      expect(mockExecuteToolFn).toHaveBeenCalledWith(mockTool.slug, params);

      vi.clearAllMocks();
      const stringParams = JSON.stringify(params);
      await executeFunction(stringParams);

      expect(mockExecuteToolFn).toHaveBeenCalledWith(mockTool.slug, params);
    });
  });

  describe('wrapTools', () => {
    it('should wrap multiple tools', () => {
      const anotherTool: Tool = {
        ...mockTool,
        slug: 'another-tool',
        name: 'Another Tool',
      };
      const tools = [mockTool, anotherTool];

      const wrapped = provider.wrapTools(tools, mockExecuteToolFn);

      expect(Object.keys(wrapped)).toHaveLength(2);
      expect(wrapped['test-tool']).toBeDefined();
      expect(wrapped['another-tool']).toBeDefined();

      expect(tool).toHaveBeenCalledTimes(2);
    });

    it('should return an empty object for empty tools array', () => {
      const wrapped = provider.wrapTools([], mockExecuteToolFn);
      expect(wrapped).toEqual({});
      expect(tool).not.toHaveBeenCalled();
    });
  });

  describe('executeTool', () => {
    it('should execute a tool using the global execute function', async () => {
      const toolSlug = 'test-tool';
      const toolParams = {
        userId: 'test-user',
        arguments: { input: 'test-value' },
      };

      const result = await provider.executeTool(toolSlug, toolParams);

      expect(mockExecuteToolFn).toHaveBeenCalledWith(toolSlug, toolParams, undefined);
      expect(result).toEqual({
        data: { result: 'success' },
        error: null,
        successful: true,
      });
    });
  });
});
```

## package.json

```json
{
  "name": "@composio/vercel",
  "version": "0.6.4",
  "description": "",
  "main": "src/index.ts",
  "publishConfig": {
    "access": "public",
    "main": "dist/index.mjs",
    "types": "dist/index.d.mts"
  },
  "exports": {
    ".": {
      "import": {
        "types": "./dist/index.d.mts",
        "default": "./dist/index.mjs"
      },
      "require": {
        "types": "./dist/index.d.cts",
        "default": "./dist/index.cjs"
      },
      "default": {
        "types": "./dist/index.d.cts",
        "default": "./dist/index.cjs"
      }
    }
  },
  "files": ["README.md", "dist"],
  "scripts": {
    "clean": "git clean -xdf node_modules",
    "build": "bun run --bun tsdown",
    "test": "vitest run"
  },
  "peerDependencies": {
    "@composio/core": "0.6.4",
    "ai": "^5.0.0 || ^6.0.0"
  },
  "devDependencies": {
    "@composio/core": "workspace:*",
    "ai": "catalog:",
    "tsdown": "catalog:",
    "typescript": "catalog:",
    "vitest": "catalog:",
    "zod": "catalog:"
  }
}
```
