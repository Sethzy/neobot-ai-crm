/**
 * Barrel exports for Composio integration helpers.
 * @module lib/composio
 */
export { getComposio } from "./client";
export {
  initiateOAuthFlow,
  type InitiateOAuthFlowParams,
  type InitiateOAuthFlowResult,
} from "./connection-flow";
export {
  searchIntegrations,
  getToolkitCapabilities,
  type CatalogIntegration,
  type ToolkitCapability,
  type ToolkitCapabilityTool,
} from "./catalog";
export { loadActivatedConnectionTools } from "./activated-tools";
export { loadComposioTools } from "./tools";
