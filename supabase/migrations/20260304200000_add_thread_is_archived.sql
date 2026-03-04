-- Add is_archived column to conversation_threads for thread cleanup
ALTER TABLE conversation_threads
  ADD COLUMN is_archived boolean NOT NULL DEFAULT false;
