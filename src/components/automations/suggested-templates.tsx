/**
 * Card grid showing suggested automation templates.
 * Click navigates to /chat with the template prompt pre-filled.
 * @module components/automations/suggested-templates
 */
"use client";

import { useRouter } from "next/navigation";

import { AUTOMATION_TEMPLATES } from "@/lib/automations/templates";

/** Renders a grid of suggested automation template cards. */
export function SuggestedTemplates() {
  const router = useRouter();

  return (
    <div>
      <p className="mb-4 text-sm font-medium text-muted-foreground">Suggested</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {AUTOMATION_TEMPLATES.map((template) => (
          <button
            key={template.id}
            type="button"
            onClick={() => {
              router.push(`/chat?prompt=${encodeURIComponent(template.prompt)}`);
            }}
            className="group flex flex-col items-start rounded-xl border border-border/40 bg-card p-5 text-left shadow-sm transition-colors hover:border-border hover:bg-secondary/30"
          >
            <span className="text-sm font-semibold text-foreground">{template.title}</span>
            <span className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              {template.description}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
