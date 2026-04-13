/**
 * Canonical managed-agent tool declaration source.
 *
 * H2 keeps the custom-tool surface dead code, but this declaration list is the
 * single source of truth for both the runtime registry and future agent
 * declaration publishing. H3/H4 should build Anthropic custom-tool payloads
 * from this module instead of maintaining a second handwritten list.
 *
 * @module lib/managed-agents/tools/declarations
 */
import {
  attachFileToRecordTool,
  configureCrmTool,
  createInteractionTool,
  createRecordTool,
  createTaskTool,
  deleteRecordAttachmentTool,
  deleteRecordsTool,
  getCrmConfigTool,
  linkRecordsTool,
  manageViewsTool,
  readRecordAttachmentTool,
  searchCrmTool,
  updateRecordTool,
  updateTaskTool,
} from "./crm";
import {
  deleteConnectionTool,
  executeComposioToolTool,
  getConnectionDetailsTool,
  getIntegrationCapabilitiesTool,
  listComposioToolsTool,
  listConnectionsTool,
  manageActivatedToolsForConnectionsTool,
  searchIntegrationsTool,
} from "./connections";
import {
  askUserQuestionTool,
  createConnectionTool,
  reauthorizeConnectionTool,
} from "./browser-side";
import { browseWebsiteTool, search99coTool, searchPropertyGuruTool } from "./browser";
import { searchMeetingsTool } from "./meetings";
import { searchMarketDataTool } from "./market";
import { sendMessageTool } from "./messaging";
import { storageReadTool, storageWriteTool } from "./storage";
import {
  getAgentDbSchemaTool,
  listTodoTool,
  manageTodoTool,
  renameChatTool,
  runSqlTool,
} from "./utility";
import { calculateDriveTimeTool, webScrapeTool, webSearchTool } from "./web";
import {
  manageActiveTriggersTool,
  searchTriggersTool,
  setupTriggerTool,
} from "./triggers";

export const MANAGED_AGENT_TOOL_DECLARATIONS = [
  askUserQuestionTool,
  attachFileToRecordTool,
  browseWebsiteTool,
  calculateDriveTimeTool,
  configureCrmTool,
  createConnectionTool,
  createInteractionTool,
  createRecordTool,
  createTaskTool,
  deleteConnectionTool,
  deleteRecordAttachmentTool,
  deleteRecordsTool,
  executeComposioToolTool,
  getAgentDbSchemaTool,
  getConnectionDetailsTool,
  getCrmConfigTool,
  getIntegrationCapabilitiesTool,
  linkRecordsTool,
  listComposioToolsTool,
  listConnectionsTool,
  listTodoTool,
  manageActivatedToolsForConnectionsTool,
  manageActiveTriggersTool,
  manageTodoTool,
  manageViewsTool,
  readRecordAttachmentTool,
  reauthorizeConnectionTool,
  renameChatTool,
  runSqlTool,
  search99coTool,
  searchCrmTool,
  searchIntegrationsTool,
  searchMarketDataTool,
  searchMeetingsTool,
  searchPropertyGuruTool,
  searchTriggersTool,
  sendMessageTool,
  setupTriggerTool,
  storageReadTool,
  storageWriteTool,
  updateRecordTool,
  updateTaskTool,
  webScrapeTool,
  webSearchTool,
] as const;

export const MANAGED_AGENT_TOOL_NAMES = MANAGED_AGENT_TOOL_DECLARATIONS.map((tool) => tool.name);
