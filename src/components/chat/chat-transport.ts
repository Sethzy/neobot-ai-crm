/**
 * Chat transport request-shaping helpers.
 * @module components/chat/chat-transport
 */
import type { PrepareSendMessagesRequest, UIMessage } from "ai";

/**
 * Shapes outbound chat requests to reduce payload size on normal submissions.
 *
 * - `submit-message`: send only the latest message
 * - `regenerate-message`: send full message history with `messageId`
 */
export const prepareChatSendMessagesRequest: PrepareSendMessagesRequest<UIMessage> = ({
  id,
  messages,
  trigger,
  messageId,
  body,
}) => {
  if (trigger === "submit-message") {
    return {
      body: {
        ...body,
        id,
        trigger,
        messageId,
        message: messages[messages.length - 1],
      },
    };
  }

  return {
    body: {
      ...body,
      id,
      trigger,
      messageId,
      messages,
    },
  };
};
