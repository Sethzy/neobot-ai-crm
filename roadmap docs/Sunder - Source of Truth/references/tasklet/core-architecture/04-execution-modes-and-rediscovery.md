# Execution Modes and Rediscovery

## Mode 1: Interactive Chat

Flow:
- User message -> LLM -> tools -> LLM -> response
- Conversation context accumulates during session
- Session end drops transient conversational memory

## Mode 2: Trigger Execution

Flow:
- Event fires -> fresh LLM instance
- Prompt is reconstructed from system prompt + system reminder + trigger payload
- Model must rediscover intent from persisted artifacts

## Rediscovery Pattern

Because trigger invocations start fresh, effective runs require:
- Reading subagent instructions
- Reading config/state files
- Querying DB/task state as needed

Without rediscoverable artifacts, behavior degrades into probabilistic guesswork.
