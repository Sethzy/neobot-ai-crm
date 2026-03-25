/**
 * Claude Skills API integration for AI-powered reports.
 * Uses beta features: Files API, Code Execution, Skills.
 * @module lib/docgen/claude-report
 */
import Anthropic, { toFile } from '@anthropic-ai/sdk';
import { getDocgenSkillId } from '../../clients/skill-registry';

const MAX_CONTINUATIONS = 10;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

/** Response content block for bash code execution results (beta) */
interface BashCodeExecutionResult {
  type: 'bash_code_execution_tool_result';
  content: {
    type: string;
    content?: Array<{ type: string; file_id?: string }>;
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Extracts the final text block from Claude response (the summary).
 * Earlier text blocks are typically status updates during execution.
 */
export function extractTextContent(response: Anthropic.Message): string | null {
  const textBlocks = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map(block => block.text);
  return textBlocks.length > 0 ? textBlocks[textBlocks.length - 1] : null;
}

/**
 * Extracts Excel file ID from Claude response.
 * Looks for file_id in bash_code_execution_tool_result blocks.
 */
export function extractExcelFileId(response: Anthropic.Message): string | null {
  for (const block of response.content) {
    const anyBlock = block as unknown as BashCodeExecutionResult;
    // Check bash_code_execution_tool_result blocks for file output
    if (anyBlock.type === 'bash_code_execution_tool_result') {
      const innerContent = anyBlock.content?.content;
      if (Array.isArray(innerContent)) {
        for (const item of innerContent) {
          if (item.file_id) {
            return item.file_id;
          }
        }
      }
    }
  }
  return null;
}

/**
 * Check if error is non-retryable (validation, auth, not found, rate limit).
 * Note: SDK auto-retries 429 errors, so we don't retry them again.
 */
export function isNonRetryableError(error: Error): boolean {
  const message = error.message.toLowerCase();
  return (
    message.includes('invalid') ||
    message.includes('unauthorized') ||
    message.includes('forbidden') ||
    message.includes('not found') ||
    message.includes('rate_limit') ||
    message.includes('429')
  );
}

/**
 * Generate an AI-powered Excel report using Claude Skills.
 * Includes retry logic for transient failures.
 * @param json - JSON string from convertSplitsToJSON()
 * @param prompt - Report generation prompt
 * @param clientId - Client config ID for loading client-specific skill
 */
export async function generateAIReport(
  json: string,
  prompt: string,
  clientId: string = 'default'
): Promise<{ fileBuffer: ArrayBuffer; aiSummary: string | null }> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await executeClaudeReport(json, prompt, clientId);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`Claude report attempt ${attempt}/${MAX_RETRIES} failed:`, lastError.message);

      if (isNonRetryableError(lastError)) {
        throw lastError;
      }

      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS * attempt);
      }
    }
  }

  throw new Error(`AI report generation failed after ${MAX_RETRIES} attempts: ${lastError?.message}`);
}

/**
 * Core Claude Skills execution logic.
 * Uses beta APIs for file upload, code execution, and xlsx skill.
 * Optionally includes client-specific custom skill if configured.
 */
async function executeClaudeReport(
  json: string,
  prompt: string,
  clientId: string
): Promise<{ fileBuffer: ArrayBuffer; aiSummary: string | null }> {
  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  // 1. Build skills array (xlsx + optional client-specific skill)
  const skills: Array<{ type: string; skill_id: string; version: string }> = [
    { type: 'anthropic', skill_id: 'xlsx', version: 'latest' },
  ];

  const clientSkillId = getDocgenSkillId(clientId);
  if (clientSkillId) {
    skills.push({ type: 'custom', skill_id: clientSkillId, version: 'latest' });
  }

  // 2. Upload JSON file (Files API beta)
  const jsonFile = await anthropic.beta.files.upload({
    file: await toFile(Buffer.from(json), 'data.json', { type: 'application/json' }),
  });

  // 3. Initial request with skills (beta endpoint)
  let response = await (anthropic.beta.messages.create as Function)({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 16384,
    betas: [
      'code-execution-2025-08-25',
      'skills-2025-10-02',
      'files-api-2025-04-14',
    ],
    tools: [{ type: 'code_execution_20250825', name: 'code_execution' }],
    tool_choice: { type: 'auto' },
    container: {
      skills,
    },
    messages: [{
      role: 'user',
      content: [
        { type: 'container_upload', file_id: jsonFile.id } as unknown as Anthropic.TextBlockParam,
        { type: 'text', text: prompt },
      ],
    }],
  }) as Anthropic.Message & { container?: { id: string } };

  // 4. Handle pause_turn for long operations
  const messages: Anthropic.MessageParam[] = [{
    role: 'user',
    content: [
      { type: 'container_upload', file_id: jsonFile.id } as unknown as Anthropic.TextBlockParam,
      { type: 'text', text: prompt },
    ],
  }];
  let continuations = 0;

  while (response.stop_reason === 'pause_turn' && continuations < MAX_CONTINUATIONS) {
    continuations++;
    messages.push({ role: 'assistant', content: response.content });
    messages.push({ role: 'user', content: 'Continue.' });

    response = await (anthropic.beta.messages.create as Function)({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 16384,
      betas: [
        'code-execution-2025-08-25',
        'skills-2025-10-02',
        'files-api-2025-04-14',
      ],
      tools: [{ type: 'code_execution_20250825', name: 'code_execution' }],
      container: {
        id: response.container!.id,
        skills,
      },
      messages,
    }) as Anthropic.Message & { container?: { id: string } };
  }

  // 5. Extract Excel file from response
  const excelFileId = extractExcelFileId(response);
  if (!excelFileId) {
    throw new Error('Claude did not generate an Excel file');
  }

  // 6. Extract AI summary from text blocks
  const aiSummary = extractTextContent(response);

  // 7. Download and return (Files API beta)
  const fileResponse = await anthropic.beta.files.download(excelFileId);
  return { fileBuffer: await fileResponse.arrayBuffer(), aiSummary };
}
