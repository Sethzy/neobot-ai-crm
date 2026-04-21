/**
 * Shared single-surface markdown editor for app forms that persist markdown as
 * plain strings. This keeps markdown as the durable storage format while
 * removing the split write/preview workflow.
 *
 * @module components/ui/markdown-editor
 */
"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

import {
  MARKDOWN_BODY_CLASSNAME,
  MARKDOWN_BODY_COMPACT_CLASSNAME,
  MarkdownRenderer,
} from "./markdown-renderer";
import type { TiptapMarkdownEditorHandle } from "./tiptap-markdown-editor";

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  placeholder?: string;
  maxLength?: number;
  disabled?: boolean;
  className?: string;
  header?: ReactNode;
  footer?: ReactNode;
  editorClassName?: string;
  /**
   * Uses the denser typography variant (smaller body, tighter headings).
   * Appropriate for authoring surfaces that trade reading comfort for
   * information density.
   */
  compact?: boolean;
}

/**
 * Presents markdown authoring as a polished in-place document editor while
 * keeping the app's markdown string contract unchanged.
 */
type TiptapMarkdownEditorComponent = (typeof import("./tiptap-markdown-editor"))["TiptapMarkdownEditor"];
type TiptapMarkdownEditorModule = typeof import("./tiptap-markdown-editor");

let tiptapMarkdownEditorPromise: Promise<TiptapMarkdownEditorModule> | null = null;

function loadTiptapMarkdownEditor(): Promise<TiptapMarkdownEditorModule> {
  if (!tiptapMarkdownEditorPromise) {
    tiptapMarkdownEditorPromise = import("./tiptap-markdown-editor");
  }

  return tiptapMarkdownEditorPromise;
}

/** Preloads the heavy Tiptap editor bundle for routes that can predict editor use. */
export function preloadMarkdownEditor(): void {
  void loadTiptapMarkdownEditor();
}

export function MarkdownEditor({
  value,
  onChange,
  ariaLabel,
  placeholder,
  maxLength,
  disabled = false,
  className,
  header,
  footer,
  editorClassName,
  compact = false,
}: MarkdownEditorProps) {
  const editorRef = useRef<TiptapMarkdownEditorHandle>(null);
  const lastExternalValueRef = useRef(value);
  const [resolvedEditor, setResolvedEditor] = useState<TiptapMarkdownEditorComponent | null>(null);

  useEffect(() => {
    if (value === lastExternalValueRef.current) {
      return;
    }

    lastExternalValueRef.current = value;
    editorRef.current?.setMarkdown(value);
  }, [value]);

  useEffect(() => {
    let isMounted = true;

    void loadTiptapMarkdownEditor().then((module) => {
      if (!isMounted) {
        return;
      }

      setResolvedEditor(() => module.TiptapMarkdownEditor);
    });

    return () => {
      isMounted = false;
    };
  }, []);

  const contentClassName = cn(
    MARKDOWN_BODY_CLASSNAME,
    "sunder-markdown-editor-body min-h-[420px] w-full py-4 focus:outline-none",
    compact && MARKDOWN_BODY_COMPACT_CLASSNAME,
    editorClassName,
  );

  const ResolvedEditor = resolvedEditor;

  return (
    <div className={className}>
      {header ? (
        <div className="border-b border-border/60 bg-gradient-to-b from-background/95 via-background/85 to-background/60 px-4 py-4 backdrop-blur-sm sm:px-5">
          {header}
        </div>
      ) : null}

      <div className="bg-gradient-to-b from-card via-card to-muted/10">
        {ResolvedEditor ? (
          <ResolvedEditor
            ariaLabel={ariaLabel}
            className="sunder-markdown-editor-root bg-card"
            contentEditableClassName={contentClassName}
            editorRef={editorRef}
            markdown={value}
            maxLength={maxLength}
            onChange={(nextMarkdown) => {
              lastExternalValueRef.current = nextMarkdown;
              onChange(nextMarkdown);
            }}
            placeholder={placeholder ?? "Write markdown..."}
            readOnly={disabled}
            spellCheck={false}
          />
        ) : (
          <MarkdownEditorFallback
            compact={compact}
            contentClassName={contentClassName}
            placeholder={placeholder}
            value={value}
          />
        )}
      </div>

      {footer ? (
        <div className="border-t border-border/60 bg-background/80 px-4 py-3 sm:px-5">
          {footer}
        </div>
      ) : null}
    </div>
  );
}

interface MarkdownEditorFallbackProps {
  value: string;
  placeholder?: string;
  contentClassName: string;
  compact?: boolean;
}

function MarkdownEditorFallback({
  value,
  placeholder,
  contentClassName,
  compact = false,
}: MarkdownEditorFallbackProps) {
  const hasContent = value.trim().length > 0;

  return (
    <div aria-hidden="true" className="sunder-markdown-editor-root bg-card">
      <div className={contentClassName}>
        {hasContent ? (
          <MarkdownRenderer compact={compact} content={value} />
        ) : (
          <p className="my-0 text-[15px] italic text-muted-foreground">
            {placeholder ?? "Write markdown..."}
          </p>
        )}
      </div>
    </div>
  );
}
