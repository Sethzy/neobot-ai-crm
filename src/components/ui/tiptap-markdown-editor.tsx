/**
 * Shared Tiptap-backed markdown editor with a native-looking toolbar and slash
 * command menu. The durable source of truth remains plain markdown text.
 *
 * @module components/ui/tiptap-markdown-editor
 */
"use client";

import type { ForwardedRef, MutableRefObject } from "react";

import {
  CharacterCount,
  Command,
  EditorCommand,
  EditorCommandEmpty,
  EditorCommandItem,
  EditorCommandList,
  EditorContent,
  type JSONContent,
  EditorRoot,
  type EditorInstance,
  Placeholder,
  StarterKit,
  TaskItem,
  TaskList,
  TiptapLink,
  createSuggestionItems,
  handleCommandNavigation,
  renderItems,
} from "novel";
import { Heading1, Heading2, Heading3, List, ListChecks, ListOrdered, Minus, Quote, Code2 } from "lucide-react";
import { Markdown } from "tiptap-markdown";
import { useEffect, useImperativeHandle, useMemo, useRef } from "react";

import { cn } from "@/lib/utils";

import "./markdown-editor.css";

export interface TiptapMarkdownEditorHandle {
  setMarkdown: (markdown: string) => void;
}

interface TiptapMarkdownEditorProps {
  ariaLabel: string;
  className?: string;
  contentEditableClassName: string;
  editorRef: ForwardedRef<TiptapMarkdownEditorHandle> | null;
  markdown: string;
  maxLength?: number;
  onChange: (markdown: string) => void;
  placeholder: string;
  readOnly?: boolean;
  spellCheck?: boolean;
}

const EMPTY_DOCUMENT: JSONContent = {
  type: "doc",
  content: [
    {
      type: "paragraph",
    },
  ],
};

const slashItems = createSuggestionItems([
  {
    title: "Heading 1",
    description: "Large section heading.",
    searchTerms: ["title", "h1", "heading"],
    icon: <Heading1 className="size-4" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHeading({ level: 1 }).run();
    },
  },
  {
    title: "Heading 2",
    description: "Medium section heading.",
    searchTerms: ["subtitle", "h2", "heading"],
    icon: <Heading2 className="size-4" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHeading({ level: 2 }).run();
    },
  },
  {
    title: "Heading 3",
    description: "Compact label heading.",
    searchTerms: ["eyebrow", "h3", "heading"],
    icon: <Heading3 className="size-4" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHeading({ level: 3 }).run();
    },
  },
  {
    title: "Bullet list",
    description: "Start an unordered list.",
    searchTerms: ["unordered", "ul", "list"],
    icon: <List className="size-4" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBulletList().run();
    },
  },
  {
    title: "Numbered list",
    description: "Start an ordered list.",
    searchTerms: ["ordered", "ol", "list"],
    icon: <ListOrdered className="size-4" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleOrderedList().run();
    },
  },
  {
    title: "Checklist",
    description: "Track items with checkboxes.",
    searchTerms: ["todo", "task", "check"],
    icon: <ListChecks className="size-4" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleTaskList().run();
    },
  },
  {
    title: "Quote",
    description: "Highlight a quoted block.",
    searchTerms: ["blockquote", "quote", "callout"],
    icon: <Quote className="size-4" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBlockquote().run();
    },
  },
  {
    title: "Code block",
    description: "Insert fenced markdown code.",
    searchTerms: ["code", "snippet", "fence"],
    icon: <Code2 className="size-4" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleCodeBlock().run();
    },
  },
  {
    title: "Divider",
    description: "Separate sections with a rule.",
    searchTerms: ["rule", "separator", "divider"],
    icon: <Minus className="size-4" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHorizontalRule().run();
    },
  },
]);

/**
 * Renders the app's single-surface markdown editor with a compact toolbar and
 * slash-command palette. Markdown stays as the persisted storage contract.
 */
export function TiptapMarkdownEditor({
  ariaLabel,
  className,
  contentEditableClassName,
  editorRef,
  markdown,
  maxLength,
  onChange,
  placeholder,
  readOnly = false,
  spellCheck = false,
}: TiptapMarkdownEditorProps) {
  const editorInstanceRef = useRef<EditorInstance | null>(null);
  const isApplyingExternalMarkdownRef = useRef(false);
  const latestMarkdownRef = useRef(markdown);

  const extensions = useMemo(() => {
    const configuredExtensions = [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Placeholder.configure({
        placeholder,
      }),
      TiptapLink.configure({
        autolink: true,
        linkOnPaste: true,
        openOnClick: false,
      }),
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      CharacterCount.configure({
        limit: maxLength,
      }),
      Markdown.configure({
        breaks: false,
        html: false,
        transformCopiedText: true,
        transformPastedText: true,
      }),
    ];

    if (!readOnly) {
      configuredExtensions.push(
        Command.configure({
          suggestion: {
            items: () => slashItems,
            render: renderItems,
          },
        }),
      );
    }

    return configuredExtensions;
  }, [maxLength, placeholder, readOnly]);

  useImperativeHandle(editorRef, () => ({
    setMarkdown(nextMarkdown: string) {
      latestMarkdownRef.current = nextMarkdown;
      applyExternalMarkdown(editorInstanceRef.current, isApplyingExternalMarkdownRef, nextMarkdown);
    },
  }), []);

  useEffect(() => {
    latestMarkdownRef.current = markdown;
    applyExternalMarkdown(editorInstanceRef.current, isApplyingExternalMarkdownRef, markdown);
  }, [markdown]);

  return (
    <EditorRoot>
      <div className={cn("sunder-markdown-editor-root bg-card", className)}>
        <EditorContent
          className="sunder-markdown-editor-host"
          editable={!readOnly}
          extensions={extensions}
          initialContent={EMPTY_DOCUMENT}
          editorProps={{
            attributes: {
              "aria-label": ariaLabel,
              class: cn("sunder-markdown-editor-prose", contentEditableClassName),
              spellcheck: spellCheck ? "true" : "false",
            },
            handleDOMEvents: {
              keydown: (_view, event) => handleCommandNavigation(event),
            },
          }}
          onCreate={({ editor }) => {
            editorInstanceRef.current = editor;
            applyExternalMarkdown(editor, isApplyingExternalMarkdownRef, latestMarkdownRef.current);
          }}
          onDestroy={() => {
            editorInstanceRef.current = null;
          }}
          onUpdate={({ editor }) => {
            if (isApplyingExternalMarkdownRef.current) {
              return;
            }

            onChange(editor.storage.markdown.getMarkdown());
          }}
        >
          {readOnly ? null : (
            <EditorCommand className="sunder-markdown-slash-menu">
              <EditorCommandEmpty className="px-3 py-6 text-sm text-muted-foreground">
                No matching block
              </EditorCommandEmpty>
              <EditorCommandList className="max-h-[24rem] overflow-y-auto p-1">
                {slashItems.map((item) => (
                  <EditorCommandItem
                    key={item.title}
                    className="sunder-markdown-slash-item"
                    keywords={item.searchTerms}
                    onCommand={(props) => item.command?.(props)}
                    value={item.title}
                  >
                    <div className="flex size-9 items-center justify-center rounded-xl border border-border/70 bg-background/80 text-muted-foreground shadow-sm">
                      {item.icon}
                    </div>
                    <div className="min-w-0 space-y-0.5">
                      <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
                      <p className="truncate text-xs text-muted-foreground">{item.description}</p>
                    </div>
                  </EditorCommandItem>
                ))}
              </EditorCommandList>
            </EditorCommand>
          )}
        </EditorContent>
      </div>
    </EditorRoot>
  );
}

function applyExternalMarkdown(
  editor: EditorInstance | null,
  isApplyingExternalMarkdownRef: MutableRefObject<boolean>,
  markdown: string,
) {
  if (!editor) {
    return;
  }

  const currentMarkdown = editor.storage.markdown.getMarkdown();

  if (currentMarkdown === markdown) {
    return;
  }

  isApplyingExternalMarkdownRef.current = true;
  editor.commands.setContent(markdown || "");

  window.setTimeout(() => {
    isApplyingExternalMarkdownRef.current = false;
  }, 0);
}
