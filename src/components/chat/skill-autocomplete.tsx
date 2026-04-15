/**
 * Slash-command autocomplete for installed managed-agent skills.
 * @module components/chat/skill-autocomplete
 */
"use client";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import type { InstalledSkillSummary } from "@/lib/runner/skills/get-installed-skills";
import { cn } from "@/lib/utils";

interface SkillAutocompleteProps {
  isError: boolean;
  isLoading: boolean;
  items: InstalledSkillSummary[];
  onSelect: (slug: string) => void;
  open: boolean;
  query: string;
  selectedIndex: number;
}

function filterSkills(
  skills: InstalledSkillSummary[],
  query: string,
): InstalledSkillSummary[] {
  const normalizedQuery = query.trim().toLowerCase();

  if (normalizedQuery.length === 0) {
    return skills;
  }

  return skills.filter((skill) =>
    skill.slug.toLowerCase().includes(normalizedQuery)
    || skill.name.toLowerCase().includes(normalizedQuery)
    || skill.description.toLowerCase().includes(normalizedQuery),
  );
}

export function SkillAutocomplete({
  isError,
  isLoading,
  items,
  onSelect,
  open,
  query,
  selectedIndex,
}: SkillAutocompleteProps) {
  if (!open) {
    return null;
  }

  const filteredSkills = filterSkills(items, query);

  return (
    <div
      className="absolute inset-x-0 top-full z-20 mt-2 px-2"
      data-testid="skill-autocomplete"
    >
      <Command
        className="overflow-hidden rounded-xl border border-border bg-popover shadow-lg"
        shouldFilter={false}
      >
        <CommandList>
          {isLoading ? (
            <div className="text-muted-foreground px-3 py-2 text-sm">
              Loading skills...
            </div>
          ) : null}
          {isError ? (
            <div className="text-muted-foreground px-3 py-2 text-sm">
              Unable to load skills right now.
            </div>
          ) : null}
          {!isLoading && !isError ? (
            <>
              <CommandEmpty>No matching skills.</CommandEmpty>
              <CommandGroup heading="Installed skills">
                {filteredSkills.map((skill, index) => (
                  <CommandItem
                    className={cn(
                      "flex flex-col items-start gap-1 py-2",
                      index === selectedIndex && "bg-accent text-accent-foreground",
                    )}
                    key={skill.slug}
                    onMouseDown={(event) => {
                      event.preventDefault();
                    }}
                    onSelect={() => onSelect(skill.slug)}
                    value={skill.slug}
                  >
                    <span className="font-medium">/{skill.slug}</span>
                    <span className="text-muted-foreground line-clamp-2 text-xs">
                      {skill.description}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          ) : null}
        </CommandList>
      </Command>
    </div>
  );
}
