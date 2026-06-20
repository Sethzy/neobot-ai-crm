# Ask Attio: A technical look at our new agent

> Source: https://x.com/attio/status/2033930208554766549

In February we shipped Ask Attio, the AI agent built into Attio.

Ask Attio is designed to work directly with CRM data, understand the product context a user is operating in, and take action where appropriate. It's not a standalone chat interface, but a system embedded into the core of the product.

Building this required more than integrating an LLM. We spent time designing the underlying architecture that makes an assistant thrive in your CRM: non-linear conversations, dynamic capabilities, automatic context inference, and streaming output that can render structured, interactive UI.

Here are some of the problems we encountered while building Ask Attio, and the systems we put in place to solve them.

## Problem 1: Conversations with AI aren't linear.

Most chat-based assistants model conversations as a simple sequence of messages. Each prompt appends to the previous one, and the only way forward is… forward.

That works reasonably well for human conversation, but it breaks down when you're collaborating with AI. When people work with an assistant, they experiment, they retry, they edit earlier prompts. They want to explore different approaches without losing the work they've already done.

To support this, we modeled Ask Attio conversations as a tree, not a list.

Each message references its parent. Editing a prompt creates a new branch. Regenerating a response forks the conversation rather than overwriting it.

This structure lets users jump back to any point in the conversation, try an alternative approach, and compare outcomes. It turns the assistant into a space for exploration.

## Problem 2: Agents needs tools.

An assistant that can only generate text is fundamentally limited. To be useful inside Attio, Ask Attio needs to query data, render structured UI, and take action - all while respecting permissions and feature access.

The challenge is that these capabilities aren't static. What Ask Attio should be able to do depends on who the user is, what data they have access to, which features are enabled, and what they're currently working on.

Rather than defining a fixed set of tools up front, we designed Ask Attio so that each conversation turn builds its own capability registry at runtime.

On every turn, the system evaluates permissions, feature flags, and contextual signals to determine which tools and components are available. This allows the assistant to stay aligned with the user's actual access and intent.

For engineers, this architecture also makes it easy to extend the system. New tools can be added independently, shipped behind a feature flag, and enabled when ready - without the need to modify any harness logic.

## Problem 3: Users don't want to manually give assistants context.

One of the most common sources of friction with AI assistants is repetition. Users are forced to restate what they're looking at, which record they mean, or which object they're referring to - even when that information is already visible on screen.

We wanted Ask Attio to understand context by default. To achieve this, we added a concept of interests.

When a user opens something in Attio - such as a call recording, a deal, or a company - the UI registers an interest. This is a structured declaration of what's currently on screen and how prominent it is.

On the backend, that interest is hydrated into rich, structured context: associated records, participants, timestamps, transcript metadata, and more. This data is then serialized and injected directly alongside the user's message.

The result is that Ask Attio can often answer questions immediately, without making additional tool calls or retrieval requests, because the relevant context is already present.

## Problem 4: LLM providers fail. Ask Attio shouldn't.

Ask Attio builds on our existing agent harness, which was designed from the start to support multiple model backends.

Rather than coupling the assistant to a single LLM provider, Ask Attio runs across multiple providers, including Anthropic, Vertex AI, and OpenAI. Each provider exposes different APIs and streaming semantics, but those differences are hidden behind a shared abstraction.

Where possible, we run model inference across multiple cloud providers, with automatic request-level failover and platform-level short-circuiting. If a request fails or a backend becomes unavailable, the harness routes subsequent traffic away without interrupting the conversation.

We also use our existing feature flag infrastructure to experiment with new models and configurations behind the scenes. This allows us to evaluate changes incrementally, compare behaviour across providers, and roll out improvements without introducing user-visible instability.

The result is an assistant whose availability and behaviour are not tied to any single model or inference provider.

## Problem 5: Streaming responses need to look good while incomplete.

Ask Attio streams responses as they're generated to minimize perceived latency. This allows users to see progress immediately, but it introduces a rendering challenge: structured text formats like Markdown are not valid until the full syntax has arrived.

Naively rendering streamed output results in broken formatting - unclosed emphasis, partial links, and visual noise that distracts from the content. Waiting until the full response is complete avoids this, but removes the benefit of streaming altogether.

To address this, we built a streaming-aware parser that understands incomplete syntax. Formatting constructs are only rendered once they are valid. Until then, they are suppressed rather than displayed in a broken state. The user sees clean, readable text throughout the response, even while it is still streaming.

We also decouple network timing from visual presentation. Responses may arrive from the backend in irregular chunks, but the frontend animates them at a steady, natural pace. This smooths over bursty model output and makes the assistant feel responsive without appearing erratic.

The result is streaming that delivers fast feedback while maintaining a polished, stable reading experience.

## Problem 6: Text alone isn't always the right interface.

Plain text responses limit what an assistant can do. Many interactions are better expressed as structured, interactive elements rather than paragraphs.

Ask Attio extends its output format to include Markdown fenced blocks containing structured JSON. Each block identifies a UI component and the data required to render it.

On the frontend, we run a streaming JSON parser alongside the text renderer. As the model streams its output, the parser incrementally parses and renders partial component payloads. UI elements can appear and update progressively as their data is generated, rather than waiting for the block to complete.

This allows Ask Attio to surface interactive elements directly in the conversation - including record cards, suggested follow-ups, call recording snippets with an inline audio player, and live indicators such as mailbox sync status - while the response is still streaming.

For engineers, defining a new component requires only a single Zod schema. The same definition is used to validate model output, drive incremental parsing, and render the corresponding UI, providing streaming, interactive behaviour out of the box.

---

Ask Attio is built as a system, not a wrapper. Conversations are non-linear, capabilities are resolved at runtime, context is inferred from the interface, models are interchangeable, and output is streamable and interactive.

Together, these choices let Ask Attio operate reliably inside real workflows - and give us a foundation we can continue to extend as the product evolves.
