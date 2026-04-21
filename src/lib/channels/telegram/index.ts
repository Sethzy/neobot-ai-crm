/**
 * Telegram channel integration entrypoint.
 * @module lib/channels/telegram
 */
export {
  createTelegramBot,
  getBotUsername,
  getTelegramBotToken,
  validateTelegramToken,
  type TelegramBotInfo,
} from "./bot";
export { markdownToTelegramHtml, sanitizeTelegramHtml } from "./format";
export {
  deleteTelegramMessage,
  detectMediaType,
  editTelegramMessage,
  normalizeTelegramChatId,
  sendTelegramMessage,
  splitTelegramMessage,
} from "./send";
export {
  generatePairingDisplayCode,
  generatePairingToken,
  isPairingDisplayCodeFormat,
  isPairingTokenFormat,
  normalizePairingDisplayCode,
  PAIRING_TOKEN_TTL_MS,
} from "./pairing";
export {
  buildApprovalCallbackData,
  buildApprovalKeyboard,
  buildApprovalText,
  parseApprovalCallback,
  sendTelegramApprovalRequest,
} from "./approvals";
export {
  buildQuestionCallbackData,
  buildQuestionKeyboard,
  buildQuestionText,
  buildUnsupportedQuestionFallback,
  formatQuestionResponse,
  getOptionLabel,
  isSupportedQuestionType,
  parseQuestionCallback,
  type QuestionOption,
  sendTelegramQuestion,
} from "./questions";
export {
  downloadAndStoreTelegramFile,
  getMediaFallbacks,
  resolveFileId,
} from "./media";
export {
  advancePendingQuestionBatchByCallback,
  advancePendingQuestionBatchByTextReply,
  clearPendingQuestionsForChat,
  deletePendingQuestionBatch,
  generateQuestionCallbackToken,
  persistPendingQuestionBatch,
  restorePendingQuestionBatch,
} from "./pending-questions";
